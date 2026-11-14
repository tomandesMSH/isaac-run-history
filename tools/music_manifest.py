"""Index the soundtracks for the page's music player.

The music isn't hosted with the page: it lives in its own GitHub repo
(tomandesMSH/Isaac-run-history.musicDb, folders rep/ and antibirth/) and the page plays it from
GitHub's raw file server (jsDelivr as a fallback), pinned to one commit. This reads that repo's file list from the GitHub API and
writes web/src/data/music-manifest.json, which is bundled into the page:

    python tools/music_manifest.py [--repo owner/name] [--ref branch-or-sha]

Run it again after changing the music repo. Each floor has a loop and often an intro played once
before it ("<name> intro.ogg"); names vary in case, spaces and underscores, and URLs care about
case, so the manifest keeps the exact file names.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web" / "src" / "data" / "music-manifest.json"
DEFAULT_REPO = "tomandesMSH/Isaac-run-history.musicDb"

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


def github(path: str) -> dict:
    req = urllib.request.Request(f"https://api.github.com{path}", headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def norm(stem: str) -> str:
    return re.sub(r"[\s_]+", " ", stem.lower()).strip()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--ref", default=None, help="branch, tag or commit (default: the repo's default branch)")
    args = ap.parse_args()

    ref = args.ref or github(f"/repos/{args.repo}")["default_branch"]
    sha = github(f"/repos/{args.repo}/commits/{ref}")["sha"]
    tree = github(f"/repos/{args.repo}/git/trees/{sha}?recursive=1")["tree"]
    paths = [t["path"] for t in tree if t["type"] == "blob"]

    out: dict = {
        "repo": args.repo,
        "commit": sha,
        # pinned to the commit, so the files never change under the page. GitHub's raw files are
        # served with the right type, CORS and ranges; jsDelivr is the fallback (it answered 403
        # for some files it hadn't cached yet).
        "base": f"https://raw.githubusercontent.com/{args.repo}/{sha}/",
        "fallback": f"https://cdn.jsdelivr.net/gh/{args.repo}@{sha}/",
        "soundtracks": [],
        "tracks": {},
    }
    for folder, label in SOUNDTRACKS.items():
        files = {}
        for p in paths:
            d, _, name = p.rpartition("/")
            stem, dot, ext = name.rpartition(".")
            if d == folder and dot and ext.lower() in ("ogg", "mp3"):
                files[norm(stem)] = p
        if not files:
            continue
        tracks = {}
        for key, name in TRACKS.items():
            loop = files.get(name)
            if not loop:
                continue
            entry = {"loop": loop}
            intro = files.get(f"{name} intro")
            if intro:
                entry["intro"] = intro
            tracks[key] = entry
        out["soundtracks"].append({"key": folder, "name": label})
        out["tracks"][folder] = tracks
        missing = sorted(set(TRACKS) - set(tracks))
        print(f"{label}: {len(tracks)} floors" + (f", none for: {', '.join(missing)}" if missing else ""))

    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"{args.repo}@{sha[:7]} -> {OUT}")


if __name__ == "__main__":
    main()
