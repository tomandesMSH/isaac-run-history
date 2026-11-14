# Isaac Run History

How many runs have you actually won as Azazel? What kills you the most? Is Brimstone really that
good, or do you just remember it because those runs were fun?

Isaac Run History records every run (wins, deaths and restarts), and a web page turns them into
statistics.

For Repentance+ with [REPENTOGON](https://repentogon.com).

The project has two parts:

- **The mod** (`mod/isaac-run-history`) saves a record of every run to your history.
- **The web page** (`web/`) takes the export and shows statistics. It runs only in your browser,
  your data goes nowhere.

## What gets saved for each run

- date and time, run length (in-game time, the same as the game's own timer)
- seed, character, difficulty (normal / hard / greed / greedier), challenge
- result: **win** (which ending), **death** (what killed you and on which floor), **quit**
  (restart, or left without saving)
- items in the order you picked them up, with the floor and room type; items you lost later
  (rerolled, swapped out) are marked
- trinkets (golden and smelted too), bosses beaten per floor, floors played including the alt path
- final stats: damage, tears, speed, range, shot speed, luck
- the [ShareSeed](https://github.com/tomandesMSH/ShareSeed) code, if you have it installed

Every export also carries **lifetime totals from the game's own save** (`persistentgamedata`),
covering every run you ever played, from before the mod too: completion marks per character, the
bestiary (what killed you how often, what you killed most), your item collection and what's still
missing, and the game's counters (deaths, final bosses beaten, best streak, Eden tokens, pills
eaten, ...). The save keeps totals only, no list of runs, so per-run stats still come from the mod.

## Installing

1. Install [REPENTOGON](https://repentogon.com).
2. Copy the `mod/isaac-run-history` folder to `...\The Binding of Isaac Rebirth\mods\`.

## Using it

Open the console and click **Run History -> Last runs / export** in the menu bar, or use the commands:

| Command                  | What it does                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `runhistory` / `rh`      | Your last 10 runs                                               |
| `rh info N`              | Run #N: items floor by floor, stats, seed                       |
| `rh export`              | Copy the whole history (JSON) to the clipboard                  |
| `rh path`                | Where the history file is                                       |
| `rh diag`                | Check what your game / REPENTOGON version provides (for bug reports) |

## Where the data is and how to get it to the web page

The history is saved in `<Isaac folder>\data\isaac-run-history\saveN.dat` (N = save slot).
That file **is the export**: JSON you can drag onto the web page. Or run `rh export` and paste
the clipboard.

The format is described in [`schema/run-history.schema.json`](schema/run-history.schema.json).

## The web page

Drag `save1.dat` (or a pasted `rh export`) onto the page. Runs are kept in the browser
(IndexedDB) and merged by run id, so importing the same file again only adds the new runs; files
from different save slots add up.

- **Statistics:** win rate per character, endings, most picked items, items with the best win rate
  (with a minimum number of runs, so one lucky run doesn't top the list), causes of death, floor of
  death, average run length. Filter by difficulty; quits can count as losses.
- **Runs:** every run, filtered by character, result, difficulty or item.
- **Lifetime:** the totals from the game's save (completion marks table, deadliest enemies, final
  bosses, collection with the missing items, every counter).
- **Run detail:** floor-by-floor timeline of items, trinkets and bosses, final stats, seed and
  ShareSeed code.

Win rate is wins / (wins + deaths): restarts and runs cut short by a crash aren't counted unless
"Count quits as losses" is on.

### Building and deploying

```
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in web/dist
```

Upload the contents of `web/dist` anywhere (it uses relative paths, so a subfolder works). There's
no backend.

### Game graphics

The room, paper, fonts and item icons in `web/public/gfx/` come from the game. They were taken
from the game's unpacked resources with `tools/extract_assets.py` (which also turns the game's
bitmap fonts into TrueType); run it again only to refresh them after a game update:

```
pip install pillow fonttools
python tools/extract_assets.py
```

### Music

The page can play the music of the floor it's set in (speaker icon in the top bar; the volume
always starts at 0). The soundtracks aren't in the repo: put them in `web/public/mus/rep/`
(Repentance+) and `web/public/mus/antibirth/` as `<floor>.ogg` / `<floor> intro.ogg`, then run
`python tools/music_manifest.py` so the page knows the exact file names.

## Limitations

- **Each save slot has its own history.** The web page can merge them.
- **Deleting the `data` folder or uninstalling the mod deletes the history.** Export it now and then.
- **The cause of death is a best guess.** The game doesn't tell mods what killed the player, so
  the last thing that hurt you is saved (for shots and bombs, whoever fired them). A death with
  no source (spikes, IV Bag, the Curse Room door) is saved as "no source".
- **Restarts shorter than 2 seconds** with no item picked up aren't saved (resetting for a good
  start, restarts by other mods).
- **Crashes:** the run in progress is saved on every floor and after every boss. If the game
  crashes and you start a new run, the previous one is saved with an "unknown" ending.
- Co-op isn't handled; only the first player is recorded.

## Target version

Repentance+ v1.9.7.12 + REPENTOGON 1.1.3 (not tested in game yet).
