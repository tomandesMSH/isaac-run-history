-- Isaac Run History: records every run (wins, deaths, restarts) with its items floor by floor,
-- bosses, cause of death, final stats and seed, and keeps the history in this save slot's mod
-- data as one JSON document. `rh export` copies it to the clipboard; the web page reads it.
--
--   scripts/recorder.lua  builds the record of the run being played
--   scripts/storage.lua   history in the mod data (the export format)
--   scripts/names.lua     names for items, characters, floors, ...
--   scripts/ui.lua        console command and ImGui window
--   scripts/lifetime.lua  totals from the game's own save (bestiary, marks, collection, counters)

local VERSION = "1.4.1"

local mod = RegisterMod("Isaac Run History", 1)

local function log(msg) Isaac.DebugString("[RunHistory] " .. msg) end

if not REPENTOGON then
  log("REPENTOGON is not installed; Isaac Run History needs it and is disabled.")
  mod:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, function()
    Isaac.ConsoleOutput("Isaac Run History needs REPENTOGON (repentogon.com) and is disabled.\n")
  end)
  return
end

-- Notifications don't word-wrap, so break long text into lines ourselves.
local function wrap(text, width)
  local lines, line = {}, ""
  for word in text:gmatch("%S+") do
    if line ~= "" and #line + 1 + #word > width then
      lines[#lines + 1], line = line, word
    else
      line = line == "" and word or (line .. " " .. word)
    end
  end
  lines[#lines + 1] = line
  return table.concat(lines, "\n")
end

local function notify(text, kind)
  log(text)
  -- the notification text goes through a printf-style formatter: a "%" in it crashed the game
  text = text:gsub("%%", "")
  if ImGui and ImGui.PushNotification then ImGui.PushNotification(wrap(text, 50), kind or 0, 5000) end
end

-- include() runs a file again on every call, so each module is loaded once here and passed around.
local names = include("scripts.names")
local storage = include("scripts.storage")
local recorder = include("scripts.recorder")
local ui = include("scripts.ui")
local lifetime = include("scripts.lifetime")

local deps = { names = names, storage = storage, recorder = recorder, log = log, notify = notify }
storage.init(mod, log, VERSION)
lifetime.init(deps)
storage.collectLifetime = lifetime.collect
recorder.init(mod, deps)
ui.init(mod, deps)

mod:AddCallback(ModCallbacks.MC_POST_SAVESLOT_LOAD, function(_, slot, selected)
  if not selected then return end
  storage.slot = slot
  storage.load()
end)

-- After a `luamod` reload no save slot is loaded again: read this slot's data right away.
pcall(storage.load)
pcall(recorder.resume_after_reload)

RUN_HISTORY_API = {
  version = VERSION,
  runs = function() return storage.runs() end,
  current = recorder.current,
  export = storage.serialize,
}
