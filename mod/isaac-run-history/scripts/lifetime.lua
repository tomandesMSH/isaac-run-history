-- Lifetime numbers from the game's own save (persistentgamedata<slot>.dat), read through
-- REPENTOGON: event counters (deaths, boss kills, streaks, ...), completion marks per character,
-- the bestiary (what killed you how often) and the item collection. They cover the whole save,
-- runs from before the mod was installed too, but only as totals: the save keeps no run list.

local lifetime = {}

local names, log
local bestiaryIds -- {type, variant} pairs, generated from entities2.xml

-- Characters the game keeps completion marks for (no Lazarus Risen, Dark Judas, The Soul, Esau...).
local MARK_CHARACTERS = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 18, 19,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37 }
local MARKS = { "MomsHeart", "Isaac", "Satan", "BossRush", "BlueBaby", "Lamb", "MegaSatan",
  "UltraGreed", "UltraGreedier", "Hush", "Delirium", "Mother", "Beast" }

local function now_iso()
  local ok, s = pcall(os.date, "!%Y-%m-%dT%H:%M:%SZ")
  return ok and s or nil
end

function lifetime.init(deps)
  names, log = deps.names, deps.log
  local ok, ids = pcall(include, "scripts.bestiary_ids")
  bestiaryIds = ok and ids or {}
end

local function counters(pgd)
  local out = {}
  if not EventCounter then return out end
  for name, id in pairs(EventCounter) do
    -- per-character progression flags are the completion marks below; the rest is unknown/online
    if type(id) == "number" and name ~= "NULL" and name ~= "NUM_EVENT_COUNTERS"
        and not name:find("^PROGRESSION_") and not name:find("^UNKNOWN") and not name:find("^ONLINE_SIN") then
      local ok, v = pcall(pgd.GetEventCounter, pgd, id)
      if ok and type(v) == "number" and v ~= 0 then out[name] = v end
    end
  end
  return out
end

local function marks()
  local out = {}
  if not Isaac.GetCompletionMarks then return out end
  for _, ptype in ipairs(MARK_CHARACTERS) do
    local ok, t = pcall(Isaac.GetCompletionMarks, ptype)
    if ok and type(t) == "table" then
      local m = {}
      for _, k in ipairs(MARKS) do m[k] = tonumber(t[k]) or 0 end
      out[#out + 1] = { id = ptype, name = names.player(ptype), marks = m }
    end
  end
  return out
end

local function bestiary(pgd)
  local out = {}
  for _, e in ipairs(bestiaryIds) do
    local t, v = e[1], e[2]
    local okK, kills = pcall(pgd.GetBestiaryKillCount, pgd, t, v)
    local okD, deaths = pcall(pgd.GetBestiaryDeathCount, pgd, t, v)
    local okE, enc = pcall(pgd.GetBestiaryEncounterCount, pgd, t, v)
    kills, deaths, enc = okK and kills or 0, okD and deaths or 0, okE and enc or 0
    if kills > 0 or deaths > 0 or enc > 0 then
      out[#out + 1] = { type = t, variant = v, name = names.entity(t, v, 0), kills = kills, deaths = deaths, encounters = enc }
    end
  end
  return out
end

local function collection(pgd)
  local cfg = Isaac.GetItemConfig()
  local okN, list = pcall(function() return cfg:GetCollectibles() end)
  local n = (okN and list and list.Size or 1) - 1
  local have, missing, total = {}, {}, 0
  for id = 1, n do
    local item = cfg:GetCollectible(id)
    if item and not item.Hidden then
      total = total + 1
      local ok, got = pcall(pgd.IsItemInCollection, pgd, id)
      if ok and got then
        have[#have + 1] = id
      else
        missing[#missing + 1] = { id = id, name = names.item(id) }
      end
    end
  end
  return { total = total, have = have, missing = missing }
end

-- The ids of every unlocked achievement. The last id is the game's Achievement.NUM_ACHIEVEMENTS - 1
-- when the enum has it, else 641 (the highest id in achievements.xml for Repentance+).
local function achievements(pgd)
  local last = (Achievement and Achievement.NUM_ACHIEVEMENTS and Achievement.NUM_ACHIEVEMENTS - 1) or 641
  local out = {}
  for id = 1, last do
    local ok, got = pcall(pgd.Unlocked, pgd, id)
    if ok and got then out[#out + 1] = id end
  end
  return out
end

-- Everything at once; nil when the save can't be read yet (before the game has initialised).
function lifetime.collect()
  local ok, pgd = pcall(Isaac.GetPersistentGameData)
  if not ok or not pgd then return nil end
  local okAll, res = pcall(function()
    return {
      takenAt = now_iso(),
      counters = counters(pgd),
      marks = marks(),
      bestiary = bestiary(pgd),
      collection = collection(pgd),
      achievements = achievements(pgd),
    }
  end)
  if not okAll then
    log("couldn't read the lifetime stats: " .. tostring(res))
    return nil
  end
  return res
end

return lifetime
