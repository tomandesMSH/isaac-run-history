-- Names for ids: items, trinkets, characters, entities, floors, completions.
--
-- In Repentance+ the item config holds string-table keys ("#SAD_ONION_NAME") instead of names.
-- The string-table category for them isn't documented, so a few are tried and the key is kept when
-- none resolves. The web page has its own name tables for vanilla ids anyway; the names stored here
-- mostly matter for modded content.

local names = {}

local ENGLISH = 0 -- Language enum value for English (REPENTOGON)
local CATEGORIES = { "Items", "Players", "Entities", "Bosses", "Challenges", "Default" }

local cache = {}

local function looks_resolved(s, key)
  return type(s) == "string" and s ~= "" and s ~= key and s:sub(1, 1) ~= "#" and not s:find("InvalidKey", 1, true)
end

-- Turn "#SAD_ONION_NAME" into "The Sad Onion" when the string table knows it. Plain text passes through.
function names.text(s)
  if type(s) ~= "string" or s == "" then return nil end
  if s:sub(1, 1) ~= "#" then return s end
  if cache[s] ~= nil then return cache[s] or s end
  local key = s:sub(2)
  if Isaac.GetLocalizedString then
    for _, cat in ipairs(CATEGORIES) do
      local ok, res = pcall(Isaac.GetLocalizedString, cat, key, ENGLISH)
      if ok and looks_resolved(res, key) then cache[s] = res; return res end
    end
  end
  if Isaac.GetString then
    for _, cat in ipairs(CATEGORIES) do
      local ok, res = pcall(Isaac.GetString, cat, key)
      if ok and looks_resolved(res, key) then cache[s] = res; return res end
    end
  end
  cache[s] = false
  return s
end

local itemConfig = Isaac.GetItemConfig()

function names.item(id)
  local cfg = itemConfig:GetCollectible(id)
  return cfg and names.text(cfg.Name) or nil
end

function names.trinket(id)
  local cfg = itemConfig:GetTrinket(id)
  return cfg and names.text(cfg.Name) or nil
end

function names.player(ptype)
  local ok, cfg = pcall(function() return EntityConfig.GetPlayer(ptype) end)
  if ok and cfg then return names.text(cfg:GetName()) end
  return nil
end

-- EntityConfig.GetEntity isn't confirmed for every REPENTOGON version, so this is best effort.
function names.entity(etype, variant, subtype)
  if not (EntityConfig and EntityConfig.GetEntity) then return nil end
  local ok, cfg = pcall(EntityConfig.GetEntity, etype, variant or 0, subtype or 0)
  if not ok or not cfg then
    ok, cfg = pcall(EntityConfig.GetEntity, etype, variant or 0)
  end
  if ok and cfg and cfg.GetName then
    local ok2, n = pcall(cfg.GetName, cfg)
    if ok2 then return names.text(n) end
  end
  return nil
end

-- CompletionType value -> enum name ("LAMB"), built from the enum itself.
local completion = {}
if CompletionType then
  for k, v in pairs(CompletionType) do completion[v] = k end
end
function names.completion(v) return completion[v] or ("COMPLETION_" .. tostring(v)) end

names.DIFFICULTY = { [0] = "normal", "hard", "greed", "greedier" }

-- Short floor names for the in-game list (the web page has the full table).
local STAGES = {
  [1] = { "Basement", "Cellar", "Burning Basement", nil, "Downpour", "Dross" },
  [3] = { "Caves", "Catacombs", "Flooded Caves", nil, "Mines", "Ashpit" },
  [5] = { "Depths", "Necropolis", "Dank Depths", nil, "Mausoleum", "Gehenna" },
  [7] = { "Womb", "Utero", "Scarred Womb", nil, "Corpse", "Corpse" },
}
local GREED = { "Basement", "Caves", "Depths", "Womb", "Sheol", "The Shop", "Ultra Greed" }

function names.floor(stage, stageType, greed)
  if greed then return GREED[stage] or ("Floor " .. stage) end
  local base = stage % 2 == 0 and stage - 1 or stage
  local row = STAGES[base]
  if row then
    local n = row[(stageType or 0) + 1] or row[1]
    return n .. (stage == base and " I" or " II")
  end
  if stage == 9 then return "Blue Womb" end
  if stage == 10 then return stageType == 1 and "Cathedral" or "Sheol" end
  if stage == 11 then return stageType == 1 and "The Chest" or "Dark Room" end
  if stage == 12 then return "The Void" end
  if stage == 13 then return "Home" end
  return "Floor " .. tostring(stage)
end

return names
