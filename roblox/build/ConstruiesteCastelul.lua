--[[
	Regatul Cenușii — Castelul (spawnul jocului)

	Cum îl folosești:
	  1. Deschide jocul în Roblox Studio.
	  2. View → Command Bar.
	  3. Copiază TOT acest fișier în Command Bar și apasă Enter.
	  4. Salvează jocul (File → Save / Publish).

	Ce face:
	  • terenul de cenușă din jur și șanțul cu apă;
	  • zidurile, cele patru turnuri cu jar aprins și poarta cu pod;
	  • curtea, cu drum de piatră, fântâna de foc și spawnul în mijloc;
	  • sala mare (Keep-ul) în nordul curții;
	  • cele două tarabe: Fierarul (armură, armă) și Antrenorul (viață, viteză);
	  • torțe pe ziduri și lumina de amurg (ceață, culori calde).

	Toți jucătorii apar în curte, în jurul fântânii. Scriptul șterge orice
	„Baseplate” și orice SpawnLocation vechi, ca nimeni să nu apară afară.
	Îl poți rula din nou oricând: șterge castelul vechi și îl face din nou.
]]

local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local CollectionService = game:GetService("CollectionService")

-- ─── Culori și materiale ────────────────────────────────────────────────
local STONE = Color3.fromRGB(64, 58, 56)
local STONE_DARK = Color3.fromRGB(44, 40, 39)
local STONE_LIGHT = Color3.fromRGB(92, 84, 80)
local WOOD = Color3.fromRGB(86, 58, 38)
local EMBER = Color3.fromRGB(255, 122, 48)
local BANNER = Color3.fromRGB(140, 28, 24)
local GOLD = Color3.fromRGB(216, 169, 100)

-- ─── Dimensiuni (în studs) ──────────────────────────────────────────────
local HALF = 80          -- curtea are 160 x 160
local WALL_H = 30
local WALL_T = 6
local TOWER_D = 24
local TOWER_H = 46
local GATE_W = 22
local GATE_H = 22
local MOAT_W = 20

-- ─── Curățenie ──────────────────────────────────────────────────────────
local old = Workspace:FindFirstChild("Castelul")
if old then old:Destroy() end
local baseplate = Workspace:FindFirstChild("Baseplate")
if baseplate then baseplate:Destroy() end
for _, item in ipairs(Workspace:GetDescendants()) do
	if item:IsA("SpawnLocation") then item:Destroy() end
end

local castle = Instance.new("Model")
castle.Name = "Castelul"
castle.Parent = Workspace

local function folder(name)
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = castle
	return f
end

local walls = folder("Ziduri")
local towers = folder("Turnuri")
local court = folder("Curtea")
local keep = folder("SalaMare")
local shops = folder("Negustori")
local lights = folder("Lumini")

local function part(parent, props)
	local p = Instance.new(props.ClassName or "Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.Slate
	p.Color = STONE
	for key, value in pairs(props) do
		if key ~= "ClassName" then p[key] = value end
	end
	p.Parent = parent
	return p
end

-- O cutie dată prin colțul de jos (x, z de mijloc) — mai ușor de gândit.
local function box(parent, name, cx, y0, cz, sx, sy, sz, props)
	props = props or {}
	props.Name = name
	props.Size = Vector3.new(sx, sy, sz)
	props.CFrame = CFrame.new(cx, y0 + sy / 2, cz)
	return part(parent, props)
end

local function addFire(parent, size, heat)
	local fire = Instance.new("Fire")
	fire.Size = size or 6
	fire.Heat = heat or 10
	fire.Color = EMBER
	fire.SecondaryColor = Color3.fromRGB(120, 30, 10)
	fire.Parent = parent
	local light = Instance.new("PointLight")
	light.Color = EMBER
	light.Range = 20
	light.Brightness = 2
	light.Parent = parent
end

-- ─── Terenul și șanțul ──────────────────────────────────────────────────
local terrain = Workspace.Terrain
terrain:Clear()
-- Câmpia de cenușă din jur.
terrain:FillBlock(CFrame.new(0, -8, 0), Vector3.new(900, 16, 900), Enum.Material.Ground)
terrain:FillBlock(CFrame.new(0, -0.5, 0), Vector3.new(900, 1, 900), Enum.Material.Basalt)
-- Șanțul: un inel săpat în jurul zidurilor și umplut cu apă.
local moatIn = HALF + WALL_T
local moatOut = moatIn + MOAT_W
local moatMid = (moatIn + moatOut) / 2
local moatLen = moatOut * 2
for _, side in ipairs({
	{ CFrame.new(0, -4, -moatMid), Vector3.new(moatLen, 8, MOAT_W) },
	{ CFrame.new(0, -4, moatMid), Vector3.new(moatLen, 8, MOAT_W) },
	{ CFrame.new(-moatMid, -4, 0), Vector3.new(MOAT_W, 8, moatLen) },
	{ CFrame.new(moatMid, -4, 0), Vector3.new(MOAT_W, 8, moatLen) },
}) do
	terrain:FillBlock(side[1], side[2], Enum.Material.Air)
	terrain:FillBlock(side[1] * CFrame.new(0, -1.5, 0), side[2] - Vector3.new(0, 3, 0), Enum.Material.Water)
end

-- Podeaua curții (piatră), puțin peste teren.
box(court, "PodeauaCurtii", 0, -0.2, 0, HALF * 2 + WALL_T * 2, 0.4, HALF * 2 + WALL_T * 2, { Material = Enum.Material.Cobblestone, Color = STONE_DARK })

-- ─── Zidurile ───────────────────────────────────────────────────────────
local function crenellate(parent, x1, z1, x2, z2)
	local length = math.max(math.abs(x2 - x1), math.abs(z2 - z1))
	local count = math.floor(length / 8)
	for i = 0, count - 1 do
		local t = (i + 0.5) / count
		local x = x1 + (x2 - x1) * t
		local z = z1 + (z2 - z1) * t
		box(parent, "Merlon", x, WALL_H, z, 4, 4, 4, { Color = STONE_LIGHT })
	end
end

local edge = HALF + WALL_T / 2
-- Nord, est, vest: ziduri întregi.
box(walls, "ZidNord", 0, 0, -edge, HALF * 2 + WALL_T * 2, WALL_H, WALL_T)
crenellate(walls, -HALF, -edge, HALF, -edge)
box(walls, "ZidEst", edge, 0, 0, WALL_T, WALL_H, HALF * 2)
crenellate(walls, edge, -HALF, edge, HALF)
box(walls, "ZidVest", -edge, 0, 0, WALL_T, WALL_H, HALF * 2)
crenellate(walls, -edge, -HALF, -edge, HALF)
-- Sud: două bucăți, cu poarta între ele.
local sideLen = HALF - GATE_W / 2
box(walls, "ZidSudStanga", -(GATE_W / 2 + sideLen / 2), 0, edge, sideLen + WALL_T, WALL_H, WALL_T)
box(walls, "ZidSudDreapta", GATE_W / 2 + sideLen / 2, 0, edge, sideLen + WALL_T, WALL_H, WALL_T)
crenellate(walls, -HALF, edge, -GATE_W / 2, edge)
crenellate(walls, GATE_W / 2, edge, HALF, edge)

-- ─── Poarta ─────────────────────────────────────────────────────────────
local gate = folder("Poarta")
box(gate, "BuiandrugPoarta", 0, GATE_H, edge, GATE_W, WALL_H - GATE_H + 6, WALL_T + 4, { Color = STONE_LIGHT })
for _, x in ipairs({ -(GATE_W / 2 + 4), GATE_W / 2 + 4 }) do
	box(gate, "StalpPoarta", x, 0, edge, 8, WALL_H + 8, WALL_T + 6, { Color = STONE_LIGHT })
	box(gate, "Steag", x, WALL_H - 18, edge + WALL_T / 2 + 3.2, 5, 14, 0.4, { Material = Enum.Material.Fabric, Color = BANNER })
end
-- Podul de lemn peste șanț.
box(gate, "Pod", 0, -0.3, edge + WALL_T / 2 + MOAT_W / 2 + 1, GATE_W - 4, 1, MOAT_W + 6, { Material = Enum.Material.WoodPlanks, Color = WOOD })
local gateSign = box(gate, "TablaPoarta", 0, GATE_H + 1, edge + WALL_T / 2 + 2.3, 18, 4, 0.5, { Material = Enum.Material.Wood, Color = WOOD })
local signGui = Instance.new("SurfaceGui")
signGui.Face = Enum.NormalId.Back
signGui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
signGui.PixelsPerStud = 30
signGui.Parent = gateSign
local signText = Instance.new("TextLabel")
signText.Size = UDim2.fromScale(1, 1)
signText.BackgroundTransparency = 1
signText.Text = "REGATUL CENUȘII"
signText.Font = Enum.Font.Fantasy
signText.TextScaled = true
signText.TextColor3 = GOLD
signText.Parent = signGui

-- ─── Turnurile din colțuri ──────────────────────────────────────────────
for _, corner in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
	local x = corner[1] * edge
	local z = corner[2] * edge
	local tower = part(towers, {
		Name = "Turn",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(TOWER_H, TOWER_D, TOWER_D),
		CFrame = CFrame.new(x, TOWER_H / 2, z) * CFrame.Angles(0, 0, math.rad(90)),
	})
	-- Coroana turnului, puțin mai lată, cu creneluri de jur împrejur.
	part(towers, {
		Name = "CoroanaTurn",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(3, TOWER_D + 4, TOWER_D + 4),
		CFrame = CFrame.new(x, TOWER_H + 1.5, z) * CFrame.Angles(0, 0, math.rad(90)),
		Color = STONE_LIGHT,
	})
	for i = 0, 9 do
		local angle = (i / 10) * math.pi * 2
		local r = TOWER_D / 2 + 1
		box(towers, "MerlonTurn", x + math.cos(angle) * r, TOWER_H + 3, z + math.sin(angle) * r, 3.5, 4, 3.5, { Color = STONE_LIGHT })
	end
	-- Jarul din vârful turnului se vede de departe.
	local brazier = box(towers, "JarTurn", x, TOWER_H + 3, z, 6, 2, 6, { Material = Enum.Material.Metal, Color = STONE_DARK })
	addFire(brazier, 9, 14)
	tower.Name = "Turn"
end

-- ─── Drumul și fântâna de foc (spawnul) ─────────────────────────────────
box(court, "DrumulMare", 0, 0, 10, 14, 0.4, HALF * 2 - 20, { Material = Enum.Material.Cobblestone, Color = STONE_LIGHT })
box(court, "DrumulCrucis", 0, 0, 0, HALF * 2 - 30, 0.4, 12, { Material = Enum.Material.Cobblestone, Color = STONE_LIGHT })

local SPAWN_Z = 0
-- Piața rotundă din jurul fântânii.
part(court, {
	Name = "PiataFantanii",
	Shape = Enum.PartType.Cylinder,
	Size = Vector3.new(0.6, 46, 46),
	CFrame = CFrame.new(0, 0.3, SPAWN_Z) * CFrame.Angles(0, 0, math.rad(90)),
	Material = Enum.Material.Cobblestone,
	Color = STONE_LIGHT,
})
part(court, {
	Name = "BazaFantanii",
	Shape = Enum.PartType.Cylinder,
	Size = Vector3.new(3, 14, 14),
	CFrame = CFrame.new(0, 1.5, SPAWN_Z) * CFrame.Angles(0, 0, math.rad(90)),
	Color = STONE_DARK,
})
local flame = part(court, {
	Name = "FlacaraFantanii",
	Shape = Enum.PartType.Cylinder,
	Size = Vector3.new(1, 9, 9),
	CFrame = CFrame.new(0, 3.5, SPAWN_Z) * CFrame.Angles(0, 0, math.rad(90)),
	Material = Enum.Material.Neon,
	Color = EMBER,
})
addFire(flame, 12, 18)

-- Patru spawnuri în jurul fântânii, ca jucătorii să nu apară unul în altul.
for i, offset in ipairs({ Vector3.new(0, 0, 14), Vector3.new(14, 0, 0), Vector3.new(-14, 0, 0), Vector3.new(0, 0, -14) }) do
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "Spawn" .. i
	spawn.Anchored = true
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.CFrame = CFrame.new(Vector3.new(0, 0.6, SPAWN_Z) + offset)
	spawn.Material = Enum.Material.Slate
	spawn.Color = STONE_DARK
	spawn.Duration = 0          -- fără câmp de protecție vizibil
	spawn.Neutral = true
	spawn.TopSurface = Enum.SurfaceType.Smooth
	local decal = spawn:FindFirstChildOfClass("Decal")
	if decal then decal:Destroy() end
	spawn.Parent = court
end

-- ─── Sala Mare (Keep-ul) ────────────────────────────────────────────────
local KEEP_Z = -HALF + 26
local KEEP_W, KEEP_D, KEEP_H = 70, 36, 30
box(keep, "ZidSpate", 0, 0, KEEP_Z - KEEP_D / 2 + 2, KEEP_W, KEEP_H, 4)
box(keep, "ZidStanga", -KEEP_W / 2 + 2, 0, KEEP_Z, 4, KEEP_H, KEEP_D)
box(keep, "ZidDreapta", KEEP_W / 2 - 2, 0, KEEP_Z, 4, KEEP_H, KEEP_D)
-- Fațada are o ușă mare în mijloc.
local frontZ = KEEP_Z + KEEP_D / 2 - 2
local doorW, doorH = 14, 16
local faceSide = (KEEP_W - doorW) / 2
box(keep, "FatadaStanga", -(doorW / 2 + faceSide / 2), 0, frontZ, faceSide, KEEP_H, 4)
box(keep, "FatadaDreapta", doorW / 2 + faceSide / 2, 0, frontZ, faceSide, KEEP_H, 4)
box(keep, "FatadaSus", 0, doorH, frontZ, doorW, KEEP_H - doorH, 4)
box(keep, "PodeaSala", 0, 0, KEEP_Z, KEEP_W - 4, 0.5, KEEP_D - 4, { Material = Enum.Material.WoodPlanks, Color = WOOD })
-- Acoperiș în trepte (stil low-poly).
for i = 0, 3 do
	box(keep, "Acoperis" .. i, 0, KEEP_H + i * 3, KEEP_Z, KEEP_W + 4 - i * 16, 3, KEEP_D + 4 - i * 8, { Color = i % 2 == 0 and STONE_DARK or STONE })
end
-- Tronul și steagurile din sală.
box(keep, "Treapta", 0, 0, KEEP_Z - 8, 22, 2, 10, { Color = STONE_LIGHT })
box(keep, "Tron", 0, 2, KEEP_Z - 11, 6, 9, 3, { Material = Enum.Material.Wood, Color = WOOD })
for _, x in ipairs({ -20, 20 }) do
	box(keep, "SteagSala", x, 8, KEEP_Z - KEEP_D / 2 + 4.3, 6, 16, 0.4, { Material = Enum.Material.Fabric, Color = BANNER })
	local brazier = box(keep, "JarSala", x, 0, KEEP_Z - 4, 4, 4, 4, { Material = Enum.Material.Metal, Color = STONE_DARK })
	addFire(brazier, 5, 8)
end

-- ─── Negustorii ─────────────────────────────────────────────────────────
-- Un negustor = tarabă + personaj din blocuri + ProximityPrompt.
-- Scriptul CastelEconomie găsește prompturile după eticheta „MagazinCastel”.
local function trader(name, title, shopId, cx, cz, facing, clothColor)
	local stall = Instance.new("Model")
	stall.Name = name
	stall.Parent = shops
	local dir = facing -- +1: tejgheaua spre est (+X), -1: spre vest
	-- Stâlpii și acoperișul de pânză.
	for _, dz in ipairs({ -9, 9 }) do
		for _, dx in ipairs({ -6, 6 }) do
			box(stall, "Stalp", cx + dx, 0, cz + dz, 1.2, 12, 1.2, { Material = Enum.Material.Wood, Color = WOOD })
		end
	end
	box(stall, "Prelata", cx, 12, cz, 16, 1, 22, { Material = Enum.Material.Fabric, Color = clothColor })
	-- Tejgheaua, spre drum.
	box(stall, "Tejghea", cx + dir * 5, 0, cz, 2.5, 4, 18, { Material = Enum.Material.WoodPlanks, Color = WOOD })
	-- Personajul (din blocuri, ca o statuie vie).
	local npcX = cx - dir * 1.5
	box(stall, "Picioare", npcX, 0, cz, 2, 4, 2.4, { Color = Color3.fromRGB(40, 32, 28) })
	local torso = box(stall, "Corp", npcX, 4, cz, 2.4, 4, 4, { Material = Enum.Material.Fabric, Color = clothColor })
	box(stall, "Cap", npcX, 8, cz, 2, 2, 2, { Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(205, 160, 125) })
	-- Numele deasupra capului.
	local tag = Instance.new("BillboardGui")
	tag.Size = UDim2.fromOffset(220, 60)
	tag.StudsOffset = Vector3.new(0, 7, 0)
	tag.AlwaysOnTop = false
	tag.MaxDistance = 80
	tag.Parent = torso
	local nameLabel = Instance.new("TextLabel")
	nameLabel.Size = UDim2.fromScale(1, 0.55)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Text = title
	nameLabel.Font = Enum.Font.Fantasy
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = GOLD
	nameLabel.TextStrokeTransparency = 0.4
	nameLabel.Parent = tag
	local hint = Instance.new("TextLabel")
	hint.Size = UDim2.fromScale(1, 0.4)
	hint.Position = UDim2.fromScale(0, 0.58)
	hint.BackgroundTransparency = 1
	hint.Text = name == "Fierarul" and "Armură și arme" or "Viață și viteză"
	hint.Font = Enum.Font.Gotham
	hint.TextScaled = true
	hint.TextColor3 = Color3.fromRGB(235, 225, 215)
	hint.TextStrokeTransparency = 0.5
	hint.Parent = tag
	-- Promptul cu care deschizi magazinul.
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Vorbește"
	prompt.ObjectText = title
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt:SetAttribute("ShopId", shopId)
	prompt.Parent = torso
	CollectionService:AddTag(prompt, "MagazinCastel")
	return stall
end

local smith = trader("Fierarul", "Fierarul Cenușii", "fierar", 46, 0, -1, Color3.fromRGB(110, 40, 30))
-- Nicovala și cuptorul fierarului.
box(smith, "Nicovala", 52, 0, -14, 3, 3, 5, { Material = Enum.Material.Metal, Color = Color3.fromRGB(70, 70, 76) })
local forge = box(smith, "Cuptor", 53, 0, 16, 6, 6, 6, { Material = Enum.Material.Brick, Color = STONE_DARK })
addFire(forge, 6, 12)

local trainer = trader("Antrenorul", "Antrenorul Regelui", "antrenor", -46, 0, 1, Color3.fromRGB(46, 62, 92))
-- Manechinele de antrenament.
for _, dz in ipairs({ -14, 14 }) do
	box(trainer, "StalpManechin", -54, 0, dz, 1, 6, 1, { Material = Enum.Material.Wood, Color = WOOD })
	box(trainer, "Manechin", -54, 4, dz, 3, 3, 1.5, { Material = Enum.Material.Fabric, Color = Color3.fromRGB(170, 140, 90) })
end

-- ─── Torțe pe ziduri ────────────────────────────────────────────────────
local function torch(x, z)
	local holder = box(lights, "Tortă", x, 12, z, 1, 3, 1, { Material = Enum.Material.Wood, Color = WOOD })
	local tip = box(lights, "FlacaraTorta", x, 15, z, 1.2, 1, 1.2, { Material = Enum.Material.Neon, Color = EMBER })
	addFire(tip, 2.5, 6)
	return holder
end
local inner = HALF - 1
for i = -2, 2 do
	local p = i * 30
	torch(p, -inner)
	torch(inner, p)
	torch(-inner, p)
	if math.abs(p) > GATE_W then torch(p, inner) end
end

-- ─── Lumina de amurg ────────────────────────────────────────────────────
Lighting.ClockTime = 18.4
Lighting.Brightness = 1.6
Lighting.Ambient = Color3.fromRGB(70, 52, 48)
Lighting.OutdoorAmbient = Color3.fromRGB(96, 74, 66)
Lighting.FogColor = Color3.fromRGB(46, 34, 32)
Lighting.FogStart = 120
Lighting.FogEnd = 650
for _, name in ipairs({ "Atmosfera", "CuloareCenusa" }) do
	local existing = Lighting:FindFirstChild(name)
	if existing then existing:Destroy() end
end
local atmosphere = Instance.new("Atmosphere")
atmosphere.Name = "Atmosfera"
atmosphere.Density = 0.38
atmosphere.Color = Color3.fromRGB(190, 120, 90)
atmosphere.Decay = Color3.fromRGB(90, 50, 40)
atmosphere.Glare = 0.2
atmosphere.Haze = 2
atmosphere.Parent = Lighting
local grade = Instance.new("ColorCorrectionEffect")
grade.Name = "CuloareCenusa"
grade.TintColor = Color3.fromRGB(255, 236, 222)
grade.Saturation = -0.1
grade.Contrast = 0.08
grade.Parent = Lighting

castle.PrimaryPart = castle:FindFirstChild("PodeauaCurtii", true)
print("🏰 Castelul Regatului Cenușii e gata. Jucătorii apar în curte, lângă fântâna de foc.")
