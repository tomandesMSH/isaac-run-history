-- Console command (`runhistory` / `rh`) and the ImGui window (console menu bar -> Run History).

local ui = {}

local names, storage, recorder, log, notify

local LIST_SIZE = 10

------------------------------------------------------------------------------------------------
-- Text
------------------------------------------------------------------------------------------------

local function duration(frames)
  local s = math.floor((frames or 0) / 30)
  if s >= 3600 then return string.format("%d:%02d:%02d", s // 3600, (s // 60) % 60, s % 60) end
  return string.format("%d:%02d", s // 60, s % 60)
end

local function outcome(r)
  local res = r.result or {}
  if res.type == "win" then return "WIN (" .. (res.ending or "?") .. ")" end
  if res.type == "death" then
    local k = res.killedBy
    local who = k and (k.name or (k.type ~= 0 and ("entity " .. k.type .. "." .. k.variant)) or "no source") or "?"
    return "DEATH (" .. who .. ")"
  end
  return string.upper(res.type or "?")
end

local function where(r)
  local res = r.result or {}
  if not res.stage then return "?" end
  return names.floor(res.stage, res.stageType, r.difficulty == "greed" or r.difficulty == "greedier")
end

local function line(i, r)
  local date = r.startedAt and r.startedAt:sub(1, 16):gsub("T", " ") or "?"
  local picked = 0
  for _, it in ipairs(r.items or {}) do if not it.starting then picked = picked + 1 end end
  return string.format("#%d  %s  %s (%s)  %s  %s  %s  %d items", i, date,
    r.character and r.character.name or "?", r.difficulty or "?", outcome(r), where(r),
    duration(r.durationFrames), picked)
end

local function recent_lines()
  local t, n = {}, #storage.runs
  for i = n, math.max(1, n - LIST_SIZE + 1), -1 do t[#t + 1] = line(i, storage.runs[i]) end
  if #t == 0 then t[1] = "No finished runs yet." end
  local c = recorder.current()
  if c then
    table.insert(t, 1, string.format("now: %s (%s), %d floor(s), %d item(s), %s", c.character and c.character.name or "?",
      c.difficulty or "?", #c.floors, #c.items, duration(c.durationFrames)))
  end
  return table.concat(t, "\n")
end

local function detail(i)
  local r = storage.runs[i]
  if not r then return "No run #" .. tostring(i) end
  local out = { line(i, r), "seed " .. tostring(r.seed) .. (r.shareSeedCode and ("   ShareSeed " .. r.shareSeedCode) or "") }
  local greed = r.difficulty == "greed" or r.difficulty == "greedier"
  for fi, f in ipairs(r.floors or {}) do
    local items = {}
    for _, it in ipairs(r.items or {}) do
      if it.floor == fi - 1 then items[#items + 1] = (it.name or ("item " .. it.id)) .. (it.removed and "*" or "") end
    end
    for _, t in ipairs(r.trinkets or {}) do
      if t.floor == fi - 1 then items[#items + 1] = "[" .. (t.name or ("trinket " .. t.id)) .. "]" end
    end
    out[#out + 1] = string.format("  %s: %s", names.floor(f.stage, f.stageType, greed),
      #items > 0 and table.concat(items, ", ") or "-")
  end
  local s = r.stats
  if s then
    out[#out + 1] = string.format("  stats: dmg %s  tears %s  speed %s  range %s  shot speed %s  luck %s",
      s.damage, s.tears, s.speed, s.range, s.shotSpeed, s.luck)
  end
  return table.concat(out, "\n")
end

local function export()
  if storage.collectLifetime then
    local ok, life = pcall(storage.collectLifetime)
    if ok and life then storage.lifetime = life end
  end
  local data = storage.serialize()
  local ok = Isaac.SetClipboard and Isaac.SetClipboard(data)
  if ok == false then return "Couldn't copy to the clipboard. Upload the file instead: " .. storage.file_path() end
  return string.format("Copied %d run(s) (%d kB) to the clipboard. Same data is in %s", #storage.runs,
    math.ceil(#data / 1024), storage.file_path())
end

-- What this REPENTOGON/game version gives us, for checking a new setup.
local function diag()
  local t = {}
  local ok, d = pcall(os.date, "!%Y-%m-%dT%H:%M:%SZ")
  t[#t + 1] = "os.date: " .. (ok and tostring(d) or ("unavailable (" .. tostring(d) .. ")"))
  t[#t + 1] = "item 1: " .. tostring(names.item(1)) .. "   raw: " .. tostring(Isaac.GetItemConfig():GetCollectible(1).Name)
  t[#t + 1] = "trinket 1: " .. tostring(names.trinket(1))
  t[#t + 1] = "player 0: " .. tostring(names.player(0))
  t[#t + 1] = "entity 20.0 (Monstro): " .. tostring(names.entity(20, 0, 0))
  t[#t + 1] = "save slot: " .. tostring(storage.slot) .. "   runs: " .. #storage.runs
  t[#t + 1] = "ShareSeed: " .. (SHARESEED_API and "installed" or "not found")
  local life = storage.collectLifetime and storage.collectLifetime()
  if life then
    local nc = 0
    for _ in pairs(life.counters) do nc = nc + 1 end
    t[#t + 1] = string.format("lifetime: %d counters, %d characters with marks, %d bestiary entries, %d/%d items collected",
      nc, #life.marks, #life.bestiary, #life.collection.have, life.collection.total)
  else
    t[#t + 1] = "lifetime: not readable yet"
  end
  return table.concat(t, "\n")
end

local HELP = [[
runhistory (rh)        your last 10 runs
rh info N              items floor by floor, stats and seed of run #N
rh export              copy the whole history (JSON) to the clipboard
rh path                where the history file is (upload it to the web page)
rh diag                check what this game/REPENTOGON version provides
]]

local function handle(sub, rest)
  if sub == "" or sub == "list" then return recent_lines()
  elseif sub == "info" then return detail(tonumber(rest) or #storage.runs)
  elseif sub == "export" then return export()
  elseif sub == "path" then return storage.file_path()
  elseif sub == "diag" then return diag()
  end
  return HELP
end

------------------------------------------------------------------------------------------------
-- ImGui window
------------------------------------------------------------------------------------------------

local W = "runHistoryWindow"
local shownVersion, shownStatus = -1, nil
local status = ""

local function build_window()
  if not ImGui or ImGui.ElementExists("runHistoryMenu") then return end
  ImGui.CreateMenu("runHistoryMenu", "Run History")
  ImGui.AddElement("runHistoryMenu", "runHistoryMenuOpen", ImGuiElement.MenuItem, "Last runs / export")
  ImGui.CreateWindow(W, "Run History")
  ImGui.LinkWindowToElement(W, "runHistoryMenuOpen")
  ImGui.SetWindowSize(W, 820, 420)

  ImGui.AddButton(W, "runHistoryExport", "Export to clipboard", function()
    status = export()
    notify("Run History: " .. status, 1)
  end, true)
  ImGui.AddElement(W, "runHistorySame1", ImGuiElement.SameLine)
  ImGui.AddButton(W, "runHistoryPath", "Show file path", function()
    status = "History file: " .. storage.file_path()
  end, true)
  ImGui.AddText(W, "", true, "runHistoryStatus")
  ImGui.AddElement(W, "runHistorySep", ImGuiElement.SeparatorText, "Last " .. LIST_SIZE .. " runs")
  ImGui.AddText(W, "", false, "runHistoryList")
end

local frame = 0
local function refresh_window()
  if not ImGui or not ImGui.ElementExists(W) then return end
  frame = frame + 1
  -- the run in progress changes all the time; redraw it twice a second
  if storage.version ~= shownVersion or (recorder.current() and frame % 30 == 0) then
    shownVersion = storage.version
    ImGui.UpdateText("runHistoryList", recent_lines())
  end
  if status ~= shownStatus then
    shownStatus = status
    ImGui.UpdateText("runHistoryStatus", status)
  end
end

------------------------------------------------------------------------------------------------

function ui.init(mod, deps)
  names, storage, recorder, log, notify = deps.names, deps.storage, deps.recorder, deps.log, deps.notify

  -- Output goes through ConsoleOutput: returning a string from MC_EXECUTE_CMD crashes the game when
  -- the command is typed into the REPENTOGON console (seen in ShareSeed on REPENTOGON 1.1.3).
  mod:AddCallback(ModCallbacks.MC_EXECUTE_CMD, function(_, cmd, args)
    if cmd ~= "runhistory" and cmd ~= "rh" then return end
    local sub, rest = (args or ""):match("^%s*(%S*)%s*(.-)%s*$")
    local ok, out = pcall(handle, sub, rest)
    local text = (ok and "" or "Run History error: ") .. tostring(out)
    if text:sub(-1) ~= "\n" then text = text .. "\n" end
    Isaac.ConsoleOutput(text)
  end)

  if Console and Console.RegisterCommand then
    Console.RegisterCommand("runhistory", "Your last runs, and export of the run history", HELP, false,
      AutocompleteType and AutocompleteType.NONE or 0)
  end

  build_window()
  mod:AddCallback(ModCallbacks.MC_POST_RENDER, refresh_window)
  mod:AddCallback(ModCallbacks.MC_MAIN_MENU_RENDER, refresh_window)
end

return ui
