--[[
	Regatul Cenușii — economia castelului (Script în ServerScriptService)

	• Fiecare jucător are Oboli și patru upgrade-uri:
	    Fierarul:   Armură (mai puține daune), Armă (mai multe daune)
	    Antrenorul: Vitalitate (viață maximă), Agilitate (viteză de mers)
	• Progresul se salvează (DataStore), la ieșire și la fiecare 2 minute.
	• Cumpărarea se verifică doar aici, pe server, ca nimeni să nu trișeze.
	• Până vin monștrii, fiecare jucător primește Oboli cât stă în joc.

	Pentru salvare, în Studio: Game Settings → Security →
	„Enable Studio Access to API Services” (pentru teste) și publică jocul.
]]

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local STORE_NAME = "RegatulCenusii_v1"
local START_GOLD = 100
local INCOME_PER_MINUTE = 15
local SAVE_EVERY = 120

-- ─── Upgrade-urile ──────────────────────────────────────────────────────
local UPGRADES = {
	armor = { shop = "fierar", order = 1, name = "Armură", emoji = "🛡️", max = 10, base = 60, growth = 1.45,
		describe = function(level) return "Daune primite: -" .. (level * 5) .. "%" end },
	weapon = { shop = "fierar", order = 2, name = "Armă", emoji = "⚔️", max = 10, base = 60, growth = 1.45,
		describe = function(level) return "Daune date: +" .. (level * 8) .. "%" end },
	vitality = { shop = "antrenor", order = 1, name = "Vitalitate", emoji = "❤️", max = 10, base = 50, growth = 1.4,
		describe = function(level) return "Viață maximă: " .. (100 + level * 20) end },
	agility = { shop = "antrenor", order = 2, name = "Agilitate", emoji = "💨", max = 8, base = 70, growth = 1.5,
		describe = function(level) return "Viteză: " .. (16 + level * 1.5) end },
}

local SHOPS = {
	fierar = { title = "Fierarul Cenușii", greeting = "Oțelul bun ține viu un războinic. Ce întărim azi?" },
	antrenor = { title = "Antrenorul Regelui", greeting = "Corpul e prima armă. Hai să-l călim." },
}

local function cost(id, level)
	local upgrade = UPGRADES[id]
	return math.floor(upgrade.base * upgrade.growth ^ level)
end

-- ─── Remote-urile (comunicarea cu fereastra magazinului) ────────────────
local remotes = ReplicatedStorage:FindFirstChild("CastelRemotes")
if not remotes then
	remotes = Instance.new("Folder")
	remotes.Name = "CastelRemotes"
	remotes.Parent = ReplicatedStorage
end
local function remote(className, name)
	local existing = remotes:FindFirstChild(name)
	if existing then return existing end
	local r = Instance.new(className)
	r.Name = name
	r.Parent = remotes
	return r
end
local openShop = remote("RemoteEvent", "DeschideMagazin")
local buyUpgrade = remote("RemoteFunction", "CumparaUpgrade")

-- ─── Datele jucătorilor ─────────────────────────────────────────────────
local store = DataStoreService:GetDataStore(STORE_NAME)
local profiles = {}

local function defaultProfile()
	return { gold = START_GOLD, armor = 0, weapon = 0, vitality = 0, agility = 0 }
end

local function sanitize(data)
	local profile = defaultProfile()
	if type(data) == "table" then
		if type(data.gold) == "number" then profile.gold = math.max(0, math.floor(data.gold)) end
		for id, upgrade in pairs(UPGRADES) do
			if type(data[id]) == "number" then profile[id] = math.clamp(math.floor(data[id]), 0, upgrade.max) end
		end
	end
	return profile
end

local function power(profile)
	return profile.armor + profile.weapon + profile.vitality + profile.agility
end

local function updateLeaderstats(player)
	local profile = profiles[player]
	local stats = player:FindFirstChild("leaderstats")
	if not profile or not stats then return end
	stats.Oboli.Value = profile.gold
	stats.Putere.Value = power(profile)
end

-- Aplică upgrade-urile pe personaj: viață, viteză și atributele pentru luptă.
local function applyStats(player)
	local profile = profiles[player]
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not profile or not humanoid then return end
	local wasFull = humanoid.Health >= humanoid.MaxHealth - 0.5
	humanoid.MaxHealth = 100 + profile.vitality * 20
	if wasFull then humanoid.Health = humanoid.MaxHealth end
	humanoid.WalkSpeed = 16 + profile.agility * 1.5
	character:SetAttribute("Armura", profile.armor * 5)   -- % daune mai puține
	character:SetAttribute("Arma", profile.weapon * 8)     -- % daune mai multe
end

local function save(player)
	local profile = profiles[player]
	if not profile then return end
	local ok, err = pcall(function()
		store:SetAsync("jucator_" .. player.UserId, profile)
	end)
	if not ok then warn("[Castel] Nu am putut salva " .. player.Name .. ": " .. tostring(err)) end
end

local function onPlayerAdded(player)
	local data
	local ok, err = pcall(function()
		data = store:GetAsync("jucator_" .. player.UserId)
	end)
	if not ok then warn("[Castel] Nu am putut citi datele lui " .. player.Name .. ": " .. tostring(err)) end
	profiles[player] = sanitize(data)

	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local gold = Instance.new("IntValue")
	gold.Name = "Oboli"
	gold.Parent = stats
	local strength = Instance.new("IntValue")
	strength.Name = "Putere"
	strength.Parent = stats
	stats.Parent = player
	updateLeaderstats(player)

	player.CharacterAdded:Connect(function(character)
		character:WaitForChild("Humanoid")
		task.wait()
		applyStats(player)
	end)
	if player.Character then applyStats(player) end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do task.spawn(onPlayerAdded, player) end

Players.PlayerRemoving:Connect(function(player)
	save(player)
	profiles[player] = nil
end)

game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do save(player) end
end)

-- Venit cât stai în joc și salvare periodică.
task.spawn(function()
	local sinceSave = 0
	while true do
		task.wait(60)
		sinceSave = sinceSave + 60
		for player, profile in pairs(profiles) do
			profile.gold = profile.gold + INCOME_PER_MINUTE
			updateLeaderstats(player)
		end
		if sinceSave >= SAVE_EVERY then
			sinceSave = 0
			for player in pairs(profiles) do task.spawn(save, player) end
		end
	end
end)

-- ─── Magazinul ──────────────────────────────────────────────────────────
-- Ce vede jucătorul la un negustor: upgrade-urile lui, nivelul, prețul.
local function shopView(player, shopId)
	local profile = profiles[player]
	local items = {}
	for id, upgrade in pairs(UPGRADES) do
		if upgrade.shop == shopId then
			local level = profile[id]
			table.insert(items, {
				id = id, order = upgrade.order, name = upgrade.name, emoji = upgrade.emoji,
				level = level, max = upgrade.max,
				now = upgrade.describe(level),
				next = level < upgrade.max and upgrade.describe(level + 1) or nil,
				price = level < upgrade.max and cost(id, level) or nil,
			})
		end
	end
	table.sort(items, function(a, b) return a.order < b.order end)
	return { shopId = shopId, title = SHOPS[shopId].title, greeting = SHOPS[shopId].greeting, gold = profile.gold, items = items }
end

local lastPrompt = {}

local function hookPrompt(prompt)
	prompt.Triggered:Connect(function(player)
		local shopId = prompt:GetAttribute("ShopId")
		if not SHOPS[shopId] or not profiles[player] then return end
		openShop:FireClient(player, shopView(player, shopId))
	end)
end
for _, prompt in ipairs(CollectionService:GetTagged("MagazinCastel")) do hookPrompt(prompt) end
CollectionService:GetInstanceAddedSignal("MagazinCastel"):Connect(hookPrompt)

-- Jucătorul trebuie să fie lângă negustor ca să cumpere (nu de oriunde din hartă).
local function nearShop(player, shopId)
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if not root then return false end
	for _, prompt in ipairs(CollectionService:GetTagged("MagazinCastel")) do
		if prompt:GetAttribute("ShopId") == shopId and prompt.Parent and prompt.Parent:IsA("BasePart") then
			if (prompt.Parent.Position - root.Position).Magnitude <= prompt.MaxActivationDistance + 10 then return true end
		end
	end
	return false
end

buyUpgrade.OnServerInvoke = function(player, id)
	local profile = profiles[player]
	local upgrade = type(id) == "string" and UPGRADES[id] or nil
	if not profile or not upgrade then return false, "Upgrade necunoscut.", nil end
	-- Cel mult o cumpărare la 0,3 secunde, ca un click dublu să nu cumpere de două ori.
	local now = os.clock()
	if lastPrompt[player] and now - lastPrompt[player] < 0.3 then return false, "Încet, războinicule.", shopView(player, upgrade.shop) end
	lastPrompt[player] = now
	if not nearShop(player, upgrade.shop) then return false, "Mergi lângă negustor.", shopView(player, upgrade.shop) end
	local level = profile[id]
	if level >= upgrade.max then return false, upgrade.name .. " e la nivelul maxim.", shopView(player, upgrade.shop) end
	local price = cost(id, level)
	if profile.gold < price then return false, "Îți mai trebuie " .. (price - profile.gold) .. " Oboli.", shopView(player, upgrade.shop) end
	profile.gold = profile.gold - price
	profile[id] = level + 1
	updateLeaderstats(player)
	applyStats(player)
	return true, upgrade.emoji .. " " .. upgrade.name .. " a ajuns la nivelul " .. profile[id] .. "!", shopView(player, upgrade.shop)
end

Players.PlayerRemoving:Connect(function(player) lastPrompt[player] = nil end)
