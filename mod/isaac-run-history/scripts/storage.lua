-- Run history storage in this save slot's mod data.
--
-- Mod:SaveData writes one string to <Isaac>/data/isaac-run-history/save<slot>.dat. That string is
-- the export format itself (see schema/run-history.schema.json), so the .dat file can be uploaded
-- to the web page as it is, and `rh export` only copies the same text to the clipboard.
--
-- Finished runs never change, so each one is encoded once and kept as a string; saving only
-- encodes the run in progress and joins the cached strings. That keeps a save cheap with
-- hundreds of runs in the history.
--
-- The game's JSON library is plain Lua and slow on big text, so loading a slot doesn't decode the
-- lifetime stats (most of the file) at all: their text is cut out and written back as it is until
-- they're read from the game again (end of a run, save & quit, `rh export`). Runs are encoded
-- again only when first saved.

local json = require("json")

local FORMAT, VERSION = "isaac-run-history", 1

local storage = {
  runs = {},       -- finished runs (tables), oldest first
  current = nil,   -- the run in progress as last checkpointed
  slot = nil,      -- save slot number, when known
  version = 0,     -- bumped on every change, for the UI
  lifetime = nil,  -- totals from the game's own save (scripts/lifetime.lua), when read this session
  collectLifetime = nil, -- set by main.lua
}

local mod, log, modVersion
local encoded = {} -- encoded[i] = JSON of storage.runs[i], filled in on the first save
local lifeJson = "null" -- JSON of the lifetime stats, as last read or as loaded from the file

local function now_iso()
  local ok, s = pcall(os.date, "!%Y-%m-%dT%H:%M:%SZ")
  return ok and s or nil
end

function storage.init(m, logger, ver)
  mod, log, modVersion = m, logger, ver
end

function storage.serialize()
  local head = json.encode({
    format = FORMAT,
    version = VERSION,
    modVersion = modVersion,
    saveSlot = storage.slot,
    exportedAt = now_iso(),
  })
  local cur = "null"
  if storage.current then
    local ok, s = pcall(json.encode, storage.current)
    if ok then cur = s else log("couldn't encode the run in progress: " .. tostring(s)) end
  end
  local runs = {}
  for i, r in ipairs(storage.runs) do
    if not encoded[i] then
      local ok, s = pcall(json.encode, r)
      encoded[i] = ok and s or false
      if not ok then log("couldn't encode run " .. tostring(r.id) .. ": " .. tostring(s)) end
    end
    if encoded[i] then runs[#runs + 1] = encoded[i] end
  end
  -- head is an object: drop its closing brace and append the big fields by hand
  return head:sub(1, -2) .. ',"lifetime":' .. lifeJson .. ',"current":' .. cur
    .. ',"runs":[' .. table.concat(runs, ",") .. "]}"
end

-- Read the lifetime stats from the game again (a few thousand calls, so not on every checkpoint).
function storage.refreshLifetime()
  if not storage.collectLifetime then return end
  local ok, life = pcall(storage.collectLifetime)
  if not ok or not life then return end
  local okE, s = pcall(json.encode, life)
  if okE then
    storage.lifetime, lifeJson = life, s
  else
    log("couldn't encode the lifetime stats: " .. tostring(s))
  end
end

-- refresh: read the lifetime stats from the game too (end of a run, save & quit).
function storage.save(refresh)
  storage.version = storage.version + 1
  if refresh or lifeJson == "null" then storage.refreshLifetime() end
  local ok, data = pcall(storage.serialize)
  if ok then
    mod:SaveData(data)
  else
    log("save failed: " .. tostring(data))
  end
end

function storage.load()
  storage.runs, storage.current, encoded = {}, nil, {}
  storage.lifetime, lifeJson = nil, "null"
  storage.version = storage.version + 1
  if not mod:HasData() then return end
  local raw = mod:LoadData()
  -- serialize writes ',"lifetime":{...},"current":': keep that text, decode only the rest
  local a = raw:find(',"lifetime":', 1, true)
  local b = a and raw:find(',"current":', a, true)
  if a and b then
    lifeJson = raw:sub(a + #',"lifetime":', b - 1)
    raw = raw:sub(1, a - 1) .. raw:sub(b)
  end
  local ok, data = pcall(json.decode, raw)
  if not ok or type(data) ~= "table" or data.format ~= FORMAT then
    log("mod data isn't a run history, starting a new one")
    return
  end
  if type(data.runs) == "table" then
    for _, r in ipairs(data.runs) do
      if type(r) == "table" then storage.runs[#storage.runs + 1] = r end
    end
  end
  if type(data.current) == "table" then storage.current = data.current end
  log("loaded " .. #storage.runs .. " run(s)" .. (storage.current and " and a run in progress" or ""))
end

function storage.add_run(run)
  local ok, s = pcall(json.encode, run)
  if not ok then
    log("couldn't encode a finished run: " .. tostring(s))
    return false
  end
  storage.runs[#storage.runs + 1] = run
  encoded[#storage.runs] = s -- same index as the run (earlier ones may not be encoded yet)
  return true
end

-- Last n runs, newest first.
function storage.recent(n)
  local t = {}
  for i = #storage.runs, math.max(1, #storage.runs - n + 1), -1 do t[#t + 1] = storage.runs[i] end
  return t
end

function storage.file_path()
  return "<Isaac folder>\\data\\isaac-run-history\\save" .. tostring(storage.slot or "N") .. ".dat"
end

return storage
