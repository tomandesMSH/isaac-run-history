-- Run history storage in this save slot's mod data.
--
-- Mod:SaveData writes one string to <Isaac>/data/isaac-run-history/save<slot>.dat. That string is
-- the export format itself (see schema/run-history.schema.json), so the .dat file can be uploaded
-- to the web page as it is, and `rh export` only copies the same text to the clipboard.
--
-- The game's JSON library is plain Lua and slow on big text, so loading a slot decodes only the
-- small parts of the file (head, summary, run in progress):
-- * the lifetime stats' text is kept as it is and written back until they're read from the game
--   again (end of a run, save & quit, `rh export`);
-- * the finished runs' text is kept as it is too and written back with the new runs appended.
--   Finished runs never change, so they're decoded only when something wants to list them
--   (`rh`, `rh info`, the Run History window), never for saving.
-- The summary (runs, wins, best win per character, win streak) is what the rest needs without
-- the runs: the count, and the line shown when a run starts.

local json = require("json")

local FORMAT, VERSION = "isaac-run-history", 1

local storage = {
  current = nil,   -- the run in progress as last checkpointed
  slot = nil,      -- save slot number, when known
  version = 0,     -- bumped on every change, for the UI
  lifetime = nil,  -- totals from the game's own save (scripts/lifetime.lua), when read this session
  summary = nil,   -- { total, streak, byCharacter = { ["<PlayerType>"] = { runs, wins, deaths, bestWin } } }
  collectLifetime = nil, -- set by main.lua
}

local mod, log, modVersion
local lifeJson = "null" -- JSON of the lifetime stats, as last read or as loaded from the file
local runsRaw = ""      -- the runs from the file: the text inside their [ ], not decoded
local added = {}        -- runs finished this session (tables) and their JSON
local addedJson = {}
local runs = nil        -- every finished run decoded, oldest first; nil until something lists them

local function now_iso()
  local ok, s = pcall(os.date, "!%Y-%m-%dT%H:%M:%SZ")
  return ok and s or nil
end

function storage.init(m, logger, ver)
  mod, log, modVersion = m, logger, ver
end

-- Summary -------------------------------------------------------------------------------------

local function empty_summary()
  return { total = 0, streak = 0, byCharacter = {} }
end

local function summarize(sum, run)
  sum.total = sum.total + 1
  local id = tostring(run.character and run.character.id or "?") -- string keys: the JSON stays an object
  local c = sum.byCharacter[id]
  if not c then
    c = { runs = 0, wins = 0, deaths = 0 }
    sum.byCharacter[id] = c
  end
  c.runs = c.runs + 1
  local kind = run.result and run.result.type
  if kind == "win" then
    c.wins = c.wins + 1
    sum.streak = sum.streak + 1
    local t = run.durationFrames
    if t and (not c.bestWin or t < c.bestWin) then c.bestWin = t end
  elseif kind == "death" then
    c.deaths = c.deaths + 1
    sum.streak = 0
  end
end

-- Runs ----------------------------------------------------------------------------------------

-- Every finished run, decoded on first use (a few hundred ms with a long history).
function storage.runs()
  if not runs then
    runs = {}
    if runsRaw ~= "" then
      local ok, list = pcall(json.decode, "[" .. runsRaw .. "]")
      if ok and type(list) == "table" then
        for _, r in ipairs(list) do
          if type(r) == "table" then runs[#runs + 1] = r end
        end
      else
        log("couldn't read the saved runs: " .. tostring(list))
      end
    end
    for _, r in ipairs(added) do runs[#runs + 1] = r end
  end
  return runs
end

-- How many finished runs there are, without decoding them.
function storage.count()
  return storage.summary and storage.summary.total or #storage.runs()
end

-- Last n runs, newest first.
function storage.recent(n)
  local all, t = storage.runs(), {}
  for i = #all, math.max(1, #all - n + 1), -1 do t[#t + 1] = all[i] end
  return t
end

function storage.add_run(run)
  local ok, s = pcall(json.encode, run)
  if not ok then
    log("couldn't encode a finished run: " .. tostring(s))
    return false
  end
  added[#added + 1], addedJson[#addedJson + 1] = run, s
  if runs then runs[#runs + 1] = run end
  storage.summary = storage.summary or empty_summary()
  summarize(storage.summary, run)
  return true
end

-- Saving --------------------------------------------------------------------------------------

function storage.serialize()
  local head = json.encode({
    format = FORMAT,
    version = VERSION,
    modVersion = modVersion,
    saveSlot = storage.slot,
    exportedAt = now_iso(),
    summary = storage.summary,
  })
  local cur = "null"
  if storage.current then
    local ok, s = pcall(json.encode, storage.current)
    if ok then cur = s else log("couldn't encode the run in progress: " .. tostring(s)) end
  end
  local list = runsRaw
  if #addedJson > 0 then list = list .. (list ~= "" and "," or "") .. table.concat(addedJson, ",") end
  -- head is an object: drop its closing brace and append the big fields by hand. The order
  -- (lifetime, current, runs last) is what load() relies on to cut them out again.
  return head:sub(1, -2) .. ',"lifetime":' .. lifeJson .. ',"current":' .. cur .. ',"runs":[' .. list .. "]}"
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

-- Loading -------------------------------------------------------------------------------------

function storage.load()
  storage.current, storage.lifetime, storage.summary = nil, nil, nil
  lifeJson, runsRaw, added, addedJson, runs = "null", "", {}, {}, nil
  storage.version = storage.version + 1
  if not mod:HasData() then return end
  local raw = mod:LoadData()
  -- serialize writes ',"lifetime":...,"current":...,"runs":[...]}': keep the lifetime's and the
  -- runs' text, decode only the rest
  local a = raw:find(',"lifetime":', 1, true)
  local b = a and raw:find(',"current":', a, true)
  if a and b then
    lifeJson = raw:sub(a + #',"lifetime":', b - 1)
    raw = raw:sub(1, a - 1) .. raw:sub(b)
  end
  local c = raw:find(',"runs":[', 1, true)
  if c and raw:sub(-2) == "]}" then
    runsRaw = raw:sub(c + #',"runs":[', -3)
    raw = raw:sub(1, c - 1) .. "}"
  end
  local ok, data = pcall(json.decode, raw)
  if not ok or type(data) ~= "table" or data.format ~= FORMAT then
    log("mod data isn't a run history, starting a new one")
    lifeJson, runsRaw = "null", ""
    return
  end
  -- a file without the cut (written by hand, older layout): its runs came decoded with the rest
  if type(data.runs) == "table" then
    local ok2, s = pcall(json.encode, data.runs)
    if ok2 then runsRaw = s:sub(2, -2) end
  end
  if type(data.current) == "table" then storage.current = data.current end
  if type(data.summary) == "table" and type(data.summary.byCharacter) == "table" then
    storage.summary = data.summary
  else
    -- files from before mod 1.4 have no summary: build it once from the runs
    local sum = empty_summary()
    for _, r in ipairs(storage.runs()) do summarize(sum, r) end
    storage.summary = sum
  end
  log("loaded " .. storage.count() .. " run(s)" .. (storage.current and " and a run in progress" or ""))
end

function storage.file_path()
  return "<Isaac folder>\\data\\isaac-run-history\\save" .. tostring(storage.slot or "N") .. ".dat"
end

return storage
