--[[
	Regatul Cenușii — fereastra negustorilor (LocalScript în StarterPlayerScripts)

	Se deschide când vorbești cu Fierarul sau cu Antrenorul (tasta E) și arată
	upgrade-urile, nivelul, ce primești la nivelul următor și prețul în Oboli.
	Butonul „Cumpără” întreabă serverul; serverul hotărăște.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("CastelRemotes")
local openShop = remotes:WaitForChild("DeschideMagazin")
local buyUpgrade = remotes:WaitForChild("CumparaUpgrade")

local INK = Color3.fromRGB(244, 232, 220)
local MUTED = Color3.fromRGB(185, 169, 156)
local GOLD = Color3.fromRGB(216, 169, 100)
local EMBER = Color3.fromRGB(238, 106, 58)
local PANEL = Color3.fromRGB(30, 22, 19)
local CARD = Color3.fromRGB(44, 33, 28)

-- ─── Construcția ferestrei ──────────────────────────────────────────────
local gui = Instance.new("ScreenGui")
gui.Name = "MagazinCastel"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Enabled = false
gui.Parent = player:WaitForChild("PlayerGui")

local shade = Instance.new("TextButton")
shade.Name = "Umbra"
shade.Size = UDim2.fromScale(1, 1)
shade.BackgroundColor3 = Color3.new(0, 0, 0)
shade.BackgroundTransparency = 0.45
shade.Text = ""
shade.AutoButtonColor = false
shade.Parent = gui

local panel = Instance.new("Frame")
panel.Name = "Panou"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.new(0.9, 0, 0, 0)
panel.AutomaticSize = Enum.AutomaticSize.Y
panel.BackgroundColor3 = PANEL
panel.Parent = gui
local sizeLimit = Instance.new("UISizeConstraint")
sizeLimit.MaxSize = Vector2.new(460, math.huge)
sizeLimit.Parent = panel
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 16)
local border = Instance.new("UIStroke")
border.Color = GOLD
border.Transparency = 0.6
border.Thickness = 1.5
border.Parent = panel
local padding = Instance.new("UIPadding")
for _, side in ipairs({ "PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight" }) do padding[side] = UDim.new(0, 18) end
padding.Parent = panel
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = panel

local function label(parent, text, size, color, font, order)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.new(1, 0, 0, size + 6)
	l.Text = text
	l.TextSize = size
	l.TextColor3 = color
	l.Font = font or Enum.Font.Gotham
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextWrapped = true
	l.AutomaticSize = Enum.AutomaticSize.Y
	l.LayoutOrder = order or 0
	l.Parent = parent
	return l
end

local title = label(panel, "", 26, GOLD, Enum.Font.Fantasy, 1)
local greeting = label(panel, "", 15, MUTED, Enum.Font.GothamMedium, 2)
local goldLine = label(panel, "", 17, INK, Enum.Font.GothamBold, 3)
local list = Instance.new("Frame")
list.Name = "Lista"
list.BackgroundTransparency = 1
list.Size = UDim2.new(1, 0, 0, 0)
list.AutomaticSize = Enum.AutomaticSize.Y
list.LayoutOrder = 4
list.Parent = panel
local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 8)
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Parent = list
local message = label(panel, "", 15, EMBER, Enum.Font.GothamMedium, 5)

local close = Instance.new("TextButton")
close.Name = "Inchide"
close.Size = UDim2.fromOffset(34, 34)
close.BackgroundTransparency = 1
close.Text = "✕"
close.TextSize = 20
close.TextColor3 = MUTED
close.Font = Enum.Font.GothamBold
-- Pe ecran, nu în panou: lista panoului l-ar pune la rând cu restul.
close.ZIndex = 5
close.Parent = gui

local current = nil
local busy = false

local function hide()
	gui.Enabled = false
	current = nil
	message.Text = ""
end

local function render(view)
	current = view
	title.Text = view.title
	greeting.Text = "„" .. view.greeting .. "”"
	goldLine.Text = "🪙 " .. view.gold .. " Oboli"
	for _, child in ipairs(list:GetChildren()) do
		if child:IsA("Frame") then child:Destroy() end
	end
	for index, item in ipairs(view.items) do
		local card = Instance.new("Frame")
		card.Name = item.id
		card.BackgroundColor3 = CARD
		card.Size = UDim2.new(1, 0, 0, 74)
		card.LayoutOrder = index
		card.Parent = list
		Instance.new("UICorner", card).CornerRadius = UDim.new(0, 12)
		local name = label(card, item.emoji .. " " .. item.name .. "  ·  nivel " .. item.level .. "/" .. item.max, 17, INK, Enum.Font.GothamBold)
		name.Position = UDim2.fromOffset(14, 10)
		name.Size = UDim2.new(1, -150, 0, 22)
		local detail = label(card, item.next and (item.now .. "  →  " .. item.next) or (item.now .. "  ·  maxim"), 14, MUTED)
		detail.Position = UDim2.fromOffset(14, 38)
		detail.Size = UDim2.new(1, -150, 0, 20)
		local buy = Instance.new("TextButton")
		buy.Name = "Cumpara"
		buy.AnchorPoint = Vector2.new(1, 0.5)
		buy.Position = UDim2.new(1, -12, 0.5, 0)
		buy.Size = UDim2.fromOffset(124, 42)
		buy.Font = Enum.Font.GothamBold
		buy.TextSize = 15
		Instance.new("UICorner", buy).CornerRadius = UDim.new(0, 10)
		if item.price then
			local affordable = view.gold >= item.price
			buy.Text = "Cumpără\n🪙 " .. item.price
			buy.BackgroundColor3 = affordable and EMBER or Color3.fromRGB(70, 56, 50)
			buy.TextColor3 = affordable and Color3.fromRGB(26, 15, 10) or MUTED
		else
			buy.Text = "Maxim"
			buy.BackgroundColor3 = Color3.fromRGB(60, 80, 60)
			buy.TextColor3 = INK
			buy.AutoButtonColor = false
		end
		buy.Parent = card
		buy.Activated:Connect(function()
			if busy or not item.price then return end
			busy = true
			local ok, ok2, text, view2 = pcall(function()
				return buyUpgrade:InvokeServer(item.id)
			end)
			busy = false
			if not ok then
				message.Text = "Negustorul nu răspunde. Încearcă din nou."
				return
			end
			if view2 then render(view2) end
			message.TextColor3 = ok2 and GOLD or EMBER
			message.Text = text or ""
		end)
	end
end

local function show(view)
	render(view)
	message.Text = ""
	gui.Enabled = true
	panel.Size = UDim2.new(0.82, 0, 0, 0)
	TweenService:Create(panel, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = UDim2.new(0.9, 0, 0, 0) }):Play()
end

-- Butonul ✕ urmează colțul panoului.
panel:GetPropertyChangedSignal("AbsolutePosition"):Connect(function()
	close.Position = UDim2.fromOffset(panel.AbsolutePosition.X + panel.AbsoluteSize.X - 40, panel.AbsolutePosition.Y + 6)
end)
panel:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
	close.Position = UDim2.fromOffset(panel.AbsolutePosition.X + panel.AbsoluteSize.X - 40, panel.AbsolutePosition.Y + 6)
end)

openShop.OnClientEvent:Connect(show)
close.Activated:Connect(hide)
shade.Activated:Connect(hide)
UserInputService.InputBegan:Connect(function(input, processed)
	if not processed and gui.Enabled and (input.KeyCode == Enum.KeyCode.Escape or input.KeyCode == Enum.KeyCode.Q) then hide() end
end)
-- Închide fereastra când jucătorul pleacă de lângă negustor sau moare.
player.CharacterAdded:Connect(hide)
