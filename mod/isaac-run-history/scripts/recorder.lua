-- Builds the record of the run being played and files it in the history when the run is over.
--
-- When a run is over:
--   win    MC_POST_GAME_END(false); the ending is the last MC_POST_COMPLETION_EVENT before it
--   death  MC_POST_GAME_END(true); the killer is the last thing that hurt the player
--          (MC_ENTITY_TAKE_DMG), since the game has no "killed by" for mods
--   quit   a new run starts while one is in progress (restart with R, a new run over a saved one)
--          or the run is left without saving
--   unknown  the game closed during a run (crash, forced quit) and the next one started fresh
--
-- The run in progress is checkpointed into the mod data on every floor, boss and save & quit, so a
-- crash loses at most the current floor's pickups.

local recorder = {}

local names, storage -- shared instances, from main.lua

local game = Game()
local log, notify
local webTipShown = false

local cur          -- the run being recorded
local ready = false -- true between MC_POST_GAME_STARTED and the end of that run
local lastHit      -- last damage the player took: { killer table }
local lastCompletion
local bossRooms = {} -- "floor:room" -> true, so a boss room is only counted once

local MIN_FRAMES = 60 -- quits shorter than this (restarts by other mods, instant resets) aren't kept
local GOLDEN_FLAG = (TrinketType and TrinketType.TRINKET_GOLDEN_FLAG) or 32768
local TRINKET_MASK = (TrinketType and TrinketType.TRINKET_ID_MASK) or 32767

------------------------------------------------------------------------------------------------
-- Small helpers
------------------------------------------------------------------------------------------------

local function round(x, d)
  if type(x) ~= "number" or x ~= x or x == math.huge or x == -math.huge then return nil end
  return tonumber(string.format("%." .. (d or 2) .. "f", x))
end

local function now_iso()
  local ok, s = pcall(os.date, "!%Y-%m-%dT%H:%M:%SZ")
  return ok and s or nil
end

local function now_unix()
  local ok, t = pcall(os.time)
  return ok and t or nil
end

-- In-game time of the run (30 per second), the same clock as the game's own run timer.
local function run_frames()
  local ok, t = pcall(function() return game.TimeCounter end)
  if ok and type(t) == "number" then return t end
  return game:GetFrameCount()
end

local function main_player() return Isaac.GetPlayer(0) end

local function read_stats(p)
  if not p then return nil end
  return {
    damage = round(p.Damage),
    tears = round(30 / (p.MaxFireDelay + 1)),
    speed = round(p.MoveSpeed),
    range = round(p.TearRange / 40),
    shotSpeed = round(p.ShotSpeed),
    luck = round(p.Luck),
  }
end

local function current_floor_index()
  return cur and math.max(0, #cur.floors - 1) or 0
end

local function shareseed_code()
  local api = SHARESEED_API
  if not (api and api.share_code and api.get_run) then return nil, nil end
  local ok, r = pcall(api.get_run)
  if not ok or type(r) ~= "table" or r.seed ~= cur.seedNum then return nil, nil end
  local ok2, code = pcall(api.share_code)
  return ok2 and code or nil, r.shared and true or false
end

------------------------------------------------------------------------------------------------
-- Building the record
------------------------------------------------------------------------------------------------

local function floor_entry()
  local level = game:GetLevel()
  return {
    stage = level:GetStage(),
    stageType = level:GetStageType(),
    curses = level:GetCurses(),
    enteredAtFrame = run_frames(),
    stats = read_stats(main_player()),
    bosses = {},
  }
end

local function item_entry(id, extra)
  local room = game:GetRoom()
  local e = {
    id = id,
    name = names.item(id),
    floor = current_floor_index(),
    frame = run_frames(),
    roomType = room and room:GetType() or nil,
  }
  local ok, pool = pcall(function() return game:GetItemPool():GetLastPool() end)
  if ok and type(pool) == "number" then e.pool = pool end
  for k, v in pairs(extra or {}) do e[k] = v end
  return e
end

local function trinket_entry(rawId, extra)
  local id = rawId & TRINKET_MASK
  local e = {
    id = id,
    name = names.trinket(id),
    golden = (rawId & GOLDEN_FLAG) ~= 0 or nil,
    floor = current_floor_index(),
    frame = run_frames(),
  }
  for k, v in pairs(extra or {}) do e[k] = v end
  return e
end

-- Items and smelted trinkets the player has from before the run started (starting items, Eden's).
local function add_history(run, asStarting)
  local p = main_player()
  if not (p and p.GetHistory) then return end
  local ok, list = pcall(function() return p:GetHistory():GetCollectiblesHistory() end)
  if not ok or type(list) ~= "table" then return end
  for _, h in ipairs(list) do
    local id = h:GetItemID()
    if h:IsTrinket() then
      run.trinkets[#run.trinkets + 1] = trinket_entry(id, { starting = asStarting or nil, smelted = true, floor = 0, frame = 0 })
    else
      run.items[#run.items + 1] = item_entry(id, { starting = asStarting or nil, floor = 0, frame = 0, roomType = h:GetRoomType() })
    end
  end
end

local function new_run(partial)
  local p = main_player()
  local seeds = game:GetSeeds()
  local seed = seeds:GetStartSeed()
  local started = now_unix()
  local ptype = p:GetPlayerType()
  local challenge = Isaac.GetChallenge()
  local run = {
    id = string.format("%d-%s-%d", seed, tostring(started or Isaac.GetNanoTime and Isaac.GetNanoTime() or 0), ptype),
    startedAt = now_iso(),
    durationFrames = run_frames(),
    seed = Seeds.Seed2String(seed),
    seedNum = seed,
    customSeed = seeds:IsCustomRun(),
    character = { id = ptype, name = names.player(ptype) },
    difficulty = names.DIFFICULTY[game.Difficulty] or tostring(game.Difficulty),
    challenge = challenge ~= 0 and { id = challenge } or nil,
    partial = partial or nil, -- recording started mid-run (mod installed or reloaded during it)
    floors = {},
    items = {},
    trinkets = {},
    completions = {},
  }
  cur = run
  run.floors[1] = floor_entry()
  add_history(run, not partial)
  if not partial then
    for slot = 0, 1 do
      local t = p:GetTrinket(slot)
      if t and t > 0 then run.trinkets[#run.trinkets + 1] = trinket_entry(t, { starting = true, floor = 0, frame = 0 }) end
    end
  end
  return run
end

-- Refresh the parts of the record that are read off the player (stats, time, ShareSeed code).
local function snapshot()
  if not cur then return end
  cur.durationFrames = run_frames()
  cur.stats = read_stats(main_player()) or cur.stats
  local code, shared = shareseed_code()
  if code then cur.shareSeedCode, cur.shareSeedRun = code, shared or nil end
end

-- Mark trinkets that ended up smelted (gulped).
local function mark_smelted()
  local p = main_player()
  if not (cur and p and p.GetHistory) then return end
  local ok, list = pcall(function() return p:GetHistory():SearchTrinkets() end)
  if not ok or type(list) ~= "table" then return end
  for _, h in ipairs(list) do
    local id = h:GetItemID() & TRINKET_MASK
    for i = #cur.trinkets, 1, -1 do
      local t = cur.trinkets[i]
      if t.id == id then t.smelted = true; break end
    end
  end
end

-- refresh: read the lifetime stats from the game too (only when a run ends or the game is left)
local function checkpoint(refresh)
  storage.current = cur
  storage.save(refresh)
end

-- File run in the history. live = the player of this run is still around to read from.
local function finalize(run, kind, opts)
  opts = opts or {}
  if run == cur then
    if opts.live then snapshot(); mark_smelted() end
    cur = nil
  end
  run.savedAndQuit = nil
  local last = run.floors[#run.floors] or {}
  run.result = {
    type = kind,
    ending = opts.ending,
    killedBy = opts.killedBy,
    stage = last.stage,
    stageType = last.stageType,
  }
  run.endedAt = opts.live and now_iso() or run.lastSeenAt or now_iso()
  run.lastSeenAt = nil
  if storage.current == run then storage.current = nil end

  local picked = 0
  for _, it in ipairs(run.items) do if not it.starting then picked = picked + 1 end end
  if (kind == "quit" or kind == "unknown") and (run.durationFrames or 0) < MIN_FRAMES and picked == 0 then
    log("dropped a " .. kind .. " run that lasted " .. tostring(run.durationFrames) .. " frames")
    storage.save(true)
    return
  end

  storage.add_run(run)
  storage.save(true)
  log(string.format("recorded run %s: %s%s", run.id, kind, opts.ending and (" (" .. opts.ending .. ")") or ""))
  if notify then
    local what = kind == "win" and ("win, " .. (opts.ending or "?")) or kind
    local tip = ""
    if not webTipShown then
      -- once per session: where the history turns into statistics
      webTipShown = true
      tip = ". Stats: tomandes.eu/isaac-run-history (rh web)"
    end
    notify("Run History: run #" .. storage.count() .. " saved (" .. what .. ")" .. tip, 0)
  end
end

------------------------------------------------------------------------------------------------
-- Death cause
------------------------------------------------------------------------------------------------

-- Entities that are only carriers: blame whoever spawned them.
local CARRIERS = {
  [EntityType.ENTITY_TEAR] = true,
  [EntityType.ENTITY_PROJECTILE] = true,
  [EntityType.ENTITY_BOMB] = true,
  [EntityType.ENTITY_LASER] = true,
  [EntityType.ENTITY_KNIFE] = true,
  [EntityType.ENTITY_EFFECT] = true,
}

local function describe_hit(source, flags)
  local t = source and source.Type or 0
  local v = source and source.Variant or 0
  local e = source and source.Entity
  local s = e and e.SubType or 0
  local killer = { type = t, variant = v, subType = s, flags = flags }
  if e and CARRIERS[t] and e.SpawnerType and e.SpawnerType ~= 0 then
    killer.via = { type = t, variant = v, subType = s, name = names.entity(t, v, s) }
    killer.type, killer.variant = e.SpawnerType, e.SpawnerVariant or 0
    killer.subType = e.SpawnerEntity and e.SpawnerEntity.SubType or 0
  end
  if killer.type ~= 0 then killer.name = names.entity(killer.type, killer.variant, killer.subType) end
  local who = killer.via and e and e.SpawnerEntity or e
  if who and who.IsBoss then
    local ok, boss = pcall(who.IsBoss, who)
    if ok and boss then killer.boss = true end
  end
  return killer
end

------------------------------------------------------------------------------------------------
-- Callbacks
------------------------------------------------------------------------------------------------

local function clock(frames)
  local s = math.floor((frames or 0) / 30)
  local h, m = math.floor(s / 3600), math.floor(s / 60) % 60
  return h > 0 and string.format("%d:%02d:%02d", h, m, s % 60) or string.format("%d:%02d", m, s % 60)
end

-- "Azazel: 12 runs - won 5 of 12 - best win 18:32 - win streak 2", from the summary (no runs
-- decoded). No "%": notifications crash on it.
local function show_record(p)
  local sum = storage.summary
  local c = sum and sum.byCharacter and sum.byCharacter[tostring(p:GetPlayerType())]
  if not (notify and c and (c.runs or 0) > 0) then return end
  local parts = { string.format("%s: %d run%s", names.player(p:GetPlayerType()), c.runs, c.runs == 1 and "" or "s") }
  local decided = (c.wins or 0) + (c.deaths or 0)
  if decided > 0 then parts[#parts + 1] = string.format("won %d of %d", c.wins or 0, decided) end
  if c.bestWin then parts[#parts + 1] = "best win " .. clock(c.bestWin) end
  if (sum.streak or 0) > 1 then parts[#parts + 1] = "win streak " .. sum.streak end
  notify(table.concat(parts, " - "), 0)
end

local function on_game_started(_, continued)
  local p = main_player()
  local seed = game:GetSeeds():GetStartSeed()
  lastHit, lastCompletion, bossRooms = nil, nil, {}

  local stale = cur or storage.current
  local same = stale and stale.seedNum == seed and stale.character and stale.character.id == p:GetPlayerType()

  if continued and same then
    cur = stale
    cur.savedAndQuit = nil
    log("continuing run " .. cur.id)
  else
    if stale then
      -- in this session: restarted; from an earlier one: saved & quit, or the game closed
      local kind = (stale == cur or stale.savedAndQuit) and "quit" or "unknown"
      finalize(stale, kind)
    end
    new_run(continued)
    if continued then log("continued a run that wasn't recorded from the start") else show_record(p) end
  end
  ready = true
  snapshot()
  checkpoint()
end

local function on_game_end(_, isGameOver)
  if not cur then return end
  if isGameOver then
    finalize(cur, "death", { live = true, killedBy = lastHit })
  else
    finalize(cur, "win", { live = true, ending = lastCompletion })
  end
  ready = false
end

local function on_game_exit(_, shouldSave)
  if cur then
    if shouldSave then
      snapshot()
      mark_smelted()
      cur.savedAndQuit = true
      cur.lastSeenAt = now_iso()
      checkpoint(true)
    else
      finalize(cur, "quit", { live = true })
    end
  end
  ready = false
end

-- A new run's player is created at frame 0, before MC_POST_GAME_STARTED: anything added from here
-- on belongs to the next run (starting items), which reads them from the history when it starts.
local function on_player_init()
  if game:GetFrameCount() == 0 then ready = false end
end

local function on_new_level()
  if not (ready and cur) then return end
  local f = floor_entry()
  local last = cur.floors[#cur.floors]
  -- a floor regenerated in place (reseed by another mod, Forget Me Now) is the same floor
  if last and last.stage == f.stage and last.stageType == f.stageType then
    last.curses = f.curses
    return
  end
  cur.floors[#cur.floors + 1] = f
  snapshot()
  mark_smelted()
  cur.lastSeenAt = now_iso()
  checkpoint()
end

local function on_item_added(_, player, id, firstTime, wispOrInnate)
  if not (ready and cur) or wispOrInnate or not firstTime then return end
  if game:GetFrameCount() == 0 then return end
  cur.items[#cur.items + 1] = item_entry(id)
end

local function on_item_removed(_, player, id, _, wispOrInnate)
  if not (ready and cur) or wispOrInnate then return end
  for i = #cur.items, 1, -1 do
    local it = cur.items[i]
    if it.id == id and not it.removed then
      it.removed = true
      it.removedFloor = current_floor_index()
      return
    end
  end
end

local function on_trinket_added(_, player, rawId, firstTime, innate)
  if not (ready and cur) or innate or not firstTime then return end
  if game:GetFrameCount() == 0 then return end
  cur.trinkets[#cur.trinkets + 1] = trinket_entry(rawId)
end

local function on_completion(_, completion)
  if not cur then return end
  lastCompletion = names.completion(completion)
  cur.completions[#cur.completions + 1] = lastCompletion
end

local function on_player_damage(_, entity, amount, flags, source)
  if not (ready and cur) then return end
  local ok, killer = pcall(describe_hit, source, flags)
  if ok then lastHit = killer end
end

local function on_clean_award()
  if not (ready and cur) then return end
  local room, level = game:GetRoom(), game:GetLevel()
  if room:GetType() ~= RoomType.ROOM_BOSS then return end
  local key = #cur.floors .. ":" .. level:GetCurrentRoomIndex()
  if bossRooms[key] then return end
  bossRooms[key] = true
  local floor = cur.floors[#cur.floors]
  for _, id in ipairs({ room:GetBossID(), room:GetSecondBossID() }) do
    if id and id > 0 then floor.bosses[#floor.bosses + 1] = { bossId = id, frame = run_frames() } end
  end
  snapshot()
  checkpoint()
end

local tick = 0
local function on_update()
  if not (ready and cur) then return end
  tick = tick + 1
  if tick % 15 == 0 then snapshot() end
end

------------------------------------------------------------------------------------------------

function recorder.init(mod, deps)
  names, storage, log, notify = deps.names, deps.storage, deps.log, deps.notify
  mod:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, on_game_started)
  mod:AddCallback(ModCallbacks.MC_POST_GAME_END, on_game_end)
  mod:AddCallback(ModCallbacks.MC_PRE_GAME_EXIT, on_game_exit)
  mod:AddCallback(ModCallbacks.MC_POST_PLAYER_INIT, on_player_init)
  mod:AddCallback(ModCallbacks.MC_POST_NEW_LEVEL, on_new_level)
  mod:AddCallback(ModCallbacks.MC_POST_TRIGGER_COLLECTIBLE_ADDED, on_item_added)
  mod:AddCallback(ModCallbacks.MC_POST_TRIGGER_COLLECTIBLE_REMOVED, on_item_removed)
  mod:AddCallback(ModCallbacks.MC_POST_TRIGGER_TRINKET_ADDED, on_trinket_added)
  mod:AddCallback(ModCallbacks.MC_POST_COMPLETION_EVENT, on_completion)
  mod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, on_player_damage, EntityType.ENTITY_PLAYER)
  mod:AddCallback(ModCallbacks.MC_PRE_SPAWN_CLEAN_AWARD, on_clean_award)
  mod:AddCallback(ModCallbacks.MC_POST_UPDATE, on_update)
end

-- After `luamod` in a run no MC_POST_GAME_STARTED comes: pick the checkpointed run back up.
function recorder.resume_after_reload()
  local ok, inRun = pcall(function() return Isaac.GetPlayer(0) ~= nil and game:GetFrameCount() > 0 end)
  if not (ok and inRun) then return end
  local c = storage.current
  local p = main_player()
  if c and c.seedNum == game:GetSeeds():GetStartSeed() and c.character and c.character.id == p:GetPlayerType() then
    cur = c
  else
    if c then finalize(c, c.savedAndQuit and "quit" or "unknown") end
    new_run(true)
  end
  ready = true
  log("resumed recording after a reload")
end

function recorder.current() return cur end

return recorder
