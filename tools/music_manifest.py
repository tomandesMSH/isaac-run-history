"""Index the soundtracks in web/public/mus/<soundtrack>/ for the page's music player.

Each floor has a loop and often an intro played once before it ("<name> intro.ogg"). File names
vary in case, spaces and underscores between the soundtracks, and web servers care about case, so
the page reads the exact names from mus/manifest.json, which this writes:

    python tools/music_manifest.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

MUS = Path(__file__).resolve().parent.parent / "web" / "public" / "mus"

SOUNDTRACKS = {"rep": "Repentance+", "antibirth": "Antibirth"}

# page background key -> track name (lowercase, spaces) in the soundtrack folders
TRACKS = {
    "basement": "basement",
    "cellar": "cellar",
    "burning-basement": "burning basement",
    "downpour": "downpour",
    "dross": "dross",
    "caves": "caves",
    "catacombs": "catacombs",
    "flooded-caves": "flooded caves",
    "mines": "mines",
    "ashpit": "ashpit",
    "depths": "depths",
    "necropolis": "necropolis",
    "dank-depths": "dank depths",
    "mausoleum": "mausoleum",
    "gehenna": "gehenna",
    "womb": "womb",
    "utero": "utero",
    "scarred-womb": "scarred womb",
    "corpse": "corpse",
    "blue-womb": "dead womb",  # the game's Blue Womb track is "Nativitate (Dead Womb Floor)"
    "sheol": "sheol",
    "cathedral": "cathedral",
    "dark-room": "darkroom",
    "chest": "chest",
}


def norm(stem: str) -> str:
    return re.sub(r"[\s_]+", " ", stem.lower()).strip()


def main() -> None:
    out: dict = {"soundtracks": [], "tracks": {}}
    for folder, label in SOUNDTRACKS.items():
        d = MUS / folder
        if not d.is_dir():
            continue
        files = {norm(p.stem): p.name for p in d.iterdir() if p.suffix.lower() in (".ogg", ".mp3")}
        tracks = {}
        for key, name in TRACKS.items():
            loop = files.get(name)
            if not loop:
                continue
            entry = {"loop": f"{folder}/{loop}"}
            intro = files.get(f"{name} intro")
            if intro:
                entry["intro"] = f"{folder}/{intro}"
            tracks[key] = entry
        out["soundtracks"].append({"key": folder, "name": label})
        out["tracks"][folder] = tracks
        missing = sorted(set(TRACKS) - set(tracks))
        print(f"{label}: {len(tracks)} floors" + (f", none for: {', '.join(missing)}" if missing else ""))
    (MUS / "manifest.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {MUS / 'manifest.json'}")


if __name__ == "__main__":
    main()
