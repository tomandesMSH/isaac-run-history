"""Extract the web page's game graphics from your own copy of The Binding of Isaac.

The page looks like the game when these files exist (room, paper, fonts, item icons); without
them it falls back to its own CSS look. They come from the game, so they aren't in the repo:
run this once before building, and check that you're fine publishing them with the page.

Needs the game's resources unpacked (the ResourceExtractor in the game's tools folder writes
them to extracted_resources), Pillow and fontTools:

    pip install pillow fonttools
    python tools/extract_assets.py ["C:\\...\\The Binding of Isaac Rebirth"]

Output: web/public/gfx/ (+ manifest.json, which tells the page what is there).
"""

from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

from PIL import Image

DEFAULT_GAME = Path(r"C:\Program Files (x86)\Steam\steamapps\common\The Binding of Isaac Rebirth")
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "gfx"


# ------------------------------------------------------------------------------------------------
# Sprites
# ------------------------------------------------------------------------------------------------

def crop(src: Path, box: tuple[int, int, int, int]) -> Image.Image:
    return Image.open(src).convert("RGBA").crop(box)


def mirror_tile(img: Image.Image) -> Image.Image:
    """2x2 tile of img and its mirror images, so it repeats without seams."""
    w, h = img.size
    out = Image.new("RGBA", (w * 2, h * 2))
    out.paste(img, (0, 0))
    out.paste(img.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    out.paste(img.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    out.paste(img.transpose(Image.ROTATE_180), (w, h))
    return out


# Floors the page can use as its background: key, name, backdrop sheet, door sheet.
BACKGROUNDS = [
    ("basement", "Basement", "01_basement", "door_01_normaldoor"),
    ("cellar", "Cellar", "02_cellar", "door_12_cellardoor"),
    ("burning-basement", "Burning Basement", "13_the burning basement", "door_01_burningbasement"),
    ("downpour", "Downpour", "01x_downpour", "door_downpour"),
    ("dross", "Dross", "02x_dross", "door_downpour"),
    ("caves", "Caves", "03_caves", "door_01_normaldoor"),
    ("catacombs", "Catacombs", "04_catacombs", "door_01_normaldoor"),
    ("flooded-caves", "Flooded Caves", "14_the drowned caves", "door_27_drownedcaves"),
    ("mines", "Mines", "03x_mines", "door_01_minesdoor"),
    ("ashpit", "Ashpit", "04x_ashpit", "door_01_minesdoor"),
    ("depths", "Depths", "05_depths", "door_14_depthsdoor"),
    ("necropolis", "Necropolis", "06_necropolis", "door_14_depthsdoor"),
    ("dank-depths", "Dank Depths", "15_the dank depths", "door_14_depthsdoor"),
    ("mausoleum", "Mausoleum", "05x_mausoleum", "door_01_mausoleumdoor"),
    ("gehenna", "Gehenna", "06x_gehenna", "door_01_gehennadoor"),
    ("womb", "Womb", "07_the womb", "door_25_wombdoor"),
    ("utero", "Utero", "08_utero", "door_25_wombdoor"),
    ("scarred-womb", "Scarred Womb", "16_the scarred womb", "door_28_scarredroomdoor"),
    ("corpse", "Corpse", "07x_corpse", "door_01_corpsedoor"),
    ("blue-womb", "Blue Womb", "18_blue womb", "door_01_bluewombdoor"),
    ("sheol", "Sheol", "09_sheol", "door_19_sheoldoor"),
    ("cathedral", "Cathedral", "10_cathedral", "door_22_cathedraldoor"),
    ("dark-room", "Dark Room", "12_darkroom", "door_21_darkroomdoor"),
    ("chest", "The Chest", "11_chest", "door_23_chestdoor"),
]
DEFAULT_BACKGROUND = "mausoleum"
WALL = 60  # wall thickness in a backdrop quarter; the floor starts here


def solid_behind(img: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    out = Image.new("RGBA", img.size, color)
    out.alpha_composite(img)
    return out


def floor_color(img: Image.Image) -> tuple[int, int, int, int]:
    """Most common opaque colour, to fill the holes some floors have (Cathedral)."""
    counts = img.getcolors(img.width * img.height) or []
    opaque = [(n, c) for n, c in counts if c[3] == 255]
    return max(opaque)[1] if opaque else (0, 0, 0, 255)


QUARTER = (234, 156)  # a backdrop cell: the top-left quarter of a 1x1 room


def wall_cells(gfx: Path, backdrop: str, count: int) -> list[Image.Image]:
    """The sheet's wall variants: quarter-room cells, two per row, whose wall band is drawn."""
    sheet = Image.open(gfx / "backdrop" / f"{backdrop}.png").convert("RGBA")
    qw, qh = QUARTER
    cells = []
    for i in range(max(count, 1) * 2):
        x, y = (i % 2) * qw, (i // 2) * qh
        if y + qh > sheet.height or len(cells) >= max(count, 1):
            break
        cell = sheet.crop((x, y, x + qw, y + qh))
        band = cell.crop((0, 0, qw, WALL)).getchannel("A")
        if sum(1 for a in band.getdata() if a > 0) > 0.8 * qw * WALL:
            cells.append(cell)
    return cells or [sheet.crop((0, 0, qw, qh))]


def variant_count(res: Path) -> dict[str, int]:
    """walls x wallvariants per backdrop sheet, from backdrops.xml."""
    xml = (res / "backdrops.xml").read_text(encoding="utf-8", errors="replace")
    out = {}
    for attrs in re.findall(r"<backdrop\s([^>]*)>", xml):
        g = re.search(r'gfx="([^"]+)\.png"', attrs)
        w = re.search(r'\swalls="(\d+)"', attrs)
        v = re.search(r'wallvariants="(\d+)"', attrs)
        if g:
            out.setdefault(g.group(1).lower(), max(1, int(w.group(1)) if w else 1) * max(1, int(v.group(1)) if v else 1))
    return out


# Details the game draws onto the walls, as crops of a detail sheet in quarter-room coordinates
# (from the floors' .anm2 files); each corner of the room gets the next variant.
WALL_OVERLAYS = {
    "downpour": [("01x_downpour_pipes", [(0, 0), (0, 234), (234, 0)])],
    "mines": [("03x_mines_details", [(0, 74, 170, 156)]), ("03x_mines_details", [(0, 0, 124, 70), (0, 160, 170, 212)])],
    "ashpit": [("04x_ashpit_details", [(0, 0, 128, 128), (128, 0, 288, 128)])],
    "gehenna": [("06x_gehenna_details", [(0, 104, 78, 182), (78, 104, 148, 182)])],
}


def overlay_crop(gfx: Path, sheet: str, spec: tuple, corner: int) -> Image.Image:
    img = Image.open(gfx / "backdrop" / f"{sheet}.png").convert("RGBA")
    if len(spec) == 2:  # whole quarter cell starting there
        x, y = spec
        return img.crop((x, y, x + QUARTER[0], y + QUARTER[1]))
    return img.crop(spec)


def compose_room(cells: list[Image.Image], overlays: list, gfx: Path, behind: Image.Image | None) -> Image.Image:
    """Four quarters, each its own wall variant (and detail), mirrored into place like the game does.
    behind: what shows where a variant leaves the floor out (the floor tile), else black."""
    qw, qh = QUARTER
    room = Image.new("RGBA", (qw * 2, qh * 2), (0, 0, 0, 255))
    if behind is not None:
        for x in range(0, room.width, behind.width):
            for y in range(0, room.height, behind.height):
                room.alpha_composite(behind, (x, y))
    flips = [None, Image.FLIP_LEFT_RIGHT, Image.FLIP_TOP_BOTTOM, Image.ROTATE_180]
    for corner, flip in enumerate(flips):
        q = cells[corner % len(cells)].copy()
        for sheet, specs in overlays:
            q.alpha_composite(overlay_crop(gfx, sheet, specs[corner % len(specs)], corner), (0, 0))
        if flip is not None:
            q = q.transpose(flip)
        room.alpha_composite(q, ((corner % 2) * qw, (corner // 2) * qh))
    return room


# Floors under a layer of water: the page lays moving caustics over them.
WET_FLOORS = {"downpour", "dross", "flooded-caves"}

# Which wall cell's floor to tile (Dross: the one with the drain grate, as most of its rooms have).
FLOOR_CELL = {"dross": 2}

# Colour the game adds with its lighting and water layers, measured from in-game screenshots
# (multiplier per channel, applied to the walls and floor).
TINT = {
    "downpour": (0.45, 0.46, 0.66),
    "dross": (0.9, 0.75, 0.45),
    "flooded-caves": (0.8, 0.9, 1.15),
    "mausoleum": (0.82, 0.74, 0.82),
}


def tint(img: Image.Image, mul: tuple[float, float, float] | None) -> Image.Image:
    if not mul:
        return img
    r, g, b, a = img.split()
    lut = lambda m: (lambda v: min(255, round(v * m)))  # noqa: E731
    return Image.merge("RGBA", (r.point(lut(mul[0])), g.point(lut(mul[1])), b.point(lut(mul[2])), a))


def build_rooms(gfx: Path, res: Path) -> list[dict]:
    for d in ("rooms", "floors", "doors"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    counts = variant_count(res)
    out = []
    for key, name, backdrop, door_sheet in BACKGROUNDS:
        cells = wall_cells(gfx, backdrop, counts.get(backdrop, 1))
        floor_cell = cells[min(FLOOR_CELL.get(key, 0), len(cells) - 1)]
        floor = floor_cell.crop((WALL + 16, WALL + 16, *QUARTER))  # past the shadow the wall casts
        floor = solid_behind(floor, floor_color(floor))
        floor_tile = mirror_tile(floor)
        tint(floor_tile, TINT.get(key)).save(OUT / "floors" / f"{key}.png")
        # the Dark Room has no walls, just darkness: keep black behind it
        behind = None if key == "dark-room" else floor_tile
        tint(compose_room(cells, WALL_OVERLAYS.get(key, []), gfx, behind), TINT.get(key)).save(OUT / "rooms" / f"{key}.png")

        # Door: dark doorway under the frame; the sheet's door faces down (top wall).
        sheet = Image.open(gfx / "grid" / f"{door_sheet}.png").convert("RGBA")
        door = Image.new("RGBA", (64, 48))
        door.alpha_composite(sheet.crop((64, 0, 128, 48)))
        door.alpha_composite(sheet.crop((0, 0, 64, 48)))
        door.rotate(90, expand=True).save(OUT / "doors" / f"{key}-left.png")
        door.rotate(-90, expand=True).save(OUT / "doors" / f"{key}-right.png")
        out.append({"key": key, "name": name, "deco": DECO.get(key, []), "details": WALL_DETAILS.get(key, []),
                    "wet": key in WET_FLOORS})
    # the light falloff the game draws over every room, and the light in the water of wet floors
    Image.open(gfx / "backdrop" / "shading.png").convert("RGBA").save(OUT / "shading.png")
    Image.open(gfx / "backdrop" / "caustics.png").convert("RGBA").save(OUT / "caustics.png")
    return out


# Animated details along the walls, placed like in the game. Positions are in a 468x312 room:
# "at" is where along the wall (0-1), "inset" how far in from the wall's outer edge, in pixels.
# top/left use the sprite as is, bottom/right mirror it.
def _torches() -> list[dict]:
    out = []
    for wall in ("top", "bottom"):
        for at, sprite in ((0.17, "torch-h2"), (0.36, "torch-h4"), (0.64, "torch-h4"), (0.83, "torch-h6")):
            out.append({"sprite": sprite, "wall": wall, "at": at, "inset": 38})
    for wall in ("left", "right"):
        for at in (0.28, 0.72):
            out.append({"sprite": "torch-v", "wall": wall, "at": at, "inset": 34})
    return out


def _along(sprite: str, wall: str, ats: tuple, inset: int) -> list[dict]:
    return [{"sprite": sprite, "wall": wall, "at": at, "inset": inset} for at in ats]


WALL_DETAILS = {
    "mausoleum": _torches(),
    # dripping pipes: in the wall, the drip runs onto the floor
    "dross": _along("dross-pipe-h", "top", (0.3, 0.7), 26) + _along("dross-pipe-v", "left", (0.65,), 26)
    + _along("dross-pipe-v", "right", (0.35,), 26),
    # tar running down the walls
    "dank-depths": [
        {"sprite": "dank-h3", "wall": "top", "at": 0.24, "inset": 26},
        {"sprite": "dank-h6", "wall": "top", "at": 0.57, "inset": 26},
        {"sprite": "dank-h8", "wall": "top", "at": 0.83, "inset": 26},
        {"sprite": "dank-v3", "wall": "left", "at": 0.45, "inset": 26},
        {"sprite": "dank-v5", "wall": "right", "at": 0.6, "inset": 26},
    ],
}

# Detail sprites from the floors' .anm2 files: sheet, frame crops (x, y), frame size, pivot
# (the point placed on the position).
DETAIL_SPRITES = {
    "torch-h2": ("05x_mausoleum_details", [(0, 0), (0, 32), (0, 64)], (32, 32), (2, 10)),
    "torch-h4": ("05x_mausoleum_details", [(32, 0), (32, 32), (32, 64)], (32, 32), (13, 10)),
    "torch-h6": ("05x_mausoleum_details", [(64, 0), (64, 32), (64, 64)], (32, 32), (24, 10)),
    "torch-v": ("05x_mausoleum_details", [(32, 96), (64, 96)], (32, 32), (10, 29)),
    "dross-pipe-h": ("02x_dross_pipes", [(78, 0), (78, 78), (78, 156)], (26, 78), (13, 26)),
    "dross-pipe-v": ("02x_dross_pipes", [(0, 0), (0, 52), (0, 104)], (78, 26), (26, 13)),
    "dank-h3": ("15_the dank depths_details", [(104, 0)], (26, 78), (13, 26)),
    "dank-h6": ("15_the dank depths_details", [(182, 0)], (26, 78), (13, 26)),
    "dank-h8": ("15_the dank depths_details", [(234, 0)], (26, 78), (13, 26)),
    "dank-v3": ("15_the dank depths_details", [(0, 104)], (78, 26), (26, 13)),
    "dank-v5": ("15_the dank depths_details", [(0, 156)], (78, 26), (26, 13)),
}


# Light the game puts around some details (the torches' tint in their .anm2), as a CSS colour.
DETAIL_GLOW = {"05x_mausoleum_details": "rgb(210 80 255)"}


def build_details(gfx: Path) -> dict:
    out = {}
    for name, (sheet, frames, (w, h), (px, py)) in DETAIL_SPRITES.items():
        img = Image.open(gfx / "backdrop" / f"{sheet}.png").convert("RGBA")
        strip = Image.new("RGBA", (w * len(frames), h))
        for i, (x, y) in enumerate(frames):
            strip.alpha_composite(img.crop((x, y, x + w, y + h)), (i * w, 0))
        strip.save(OUT / "deco" / f"{name}.png")
        out[name] = {"w": w, "h": h, "frames": len(frames), "px": px, "py": py, "frameTime": 0.1,
                     "glow": DETAIL_GLOW.get(sheet)}
    return out


# Four props per floor, standing in the room's corners: top-left, top-right, bottom-left, bottom-right.
# fire-<colour> is an animated fireplace, rock-/rock2-<sheet> come from that floor's rock sheet.
DECO = {
    "basement": ["fire", "rock-basement", "poop", "fire"],
    "cellar": ["rock-cellar", "fire", "fire", "rock2-cellar"],
    "burning-basement": ["fire-red", "rock-burningbasement", "rock2-burningbasement", "fire-red"],
    "downpour": ["fire-blue", "rock-downpour", "rock2-downpour", "fire-white"],
    "dross": ["fire-white", "fire", "rock-dross", "poop"],
    "caves": ["rock-caves", "fire", "fire", "rock2-caves"],
    "catacombs": ["rock2-catacombs", "fire", "fire", "rock-catacombs"],
    "flooded-caves": ["rock-drownedcaves", "fire-blue", "fire-blue", "rock2-drownedcaves"],
    "mines": ["rock-caves", "fire", "chest-grey", "rock2-caves"],
    "ashpit": ["rock-ashpit", "fire", "fire", "rock2-ashpit"],
    "depths": ["fire", "rock2-depths", "rock-depths", "fire"],
    "necropolis": ["rock2-depths", "fire", "fire", "rock2-depths"],
    "dank-depths": ["rock-depths", "fire", "fire", "rock-depths"],
    "mausoleum": ["fire-purple", "fire-purple", "fire-purple", "fire-purple"],
    "gehenna": ["fire-red", "rock2-gehenna", "rock-gehenna", "fire-red"],
    "womb": ["rock-womb", "rock2-womb", "rock2-womb", "rock-womb"],
    "utero": ["rock2-utero", "rock-utero", "rock-utero", "rock2-utero"],
    "scarred-womb": ["rock-scarredwomb", "rock2-scarredwomb", "rock2-scarredwomb", "rock-scarredwomb"],
    "corpse": ["rock-corpse", "rock2-corpse", "rock2-corpse", "rock-corpse"],
    "blue-womb": ["fire-blue", "rock-bluewomb", "rock2-bluewomb", "fire-blue"],
    "sheol": ["fire-red", "rock2-sheol", "rock-sheol", "fire-red"],
    "cathedral": ["fire-white", "rock-cathedral", "rock2-cathedral", "fire-white"],
    "dark-room": ["chest-red", "chest-red", "chest-red", "chest-red"],
    "chest": ["chest-gold", "chest-gold", "chest-gold", "chest-gold"],
}

CHESTS = {"grey": (1, 53, 31, 76), "gold": (1, 85, 31, 108), "white": (65, 85, 95, 108), "red": (1, 117, 31, 140)}
FIRE_FRAMES = [(0, 0), (48, 0), (96, 0), (144, 0), (192, 0), (0, 48)]  # 48x48 cells of effect_005_fire


def bottom_centered(img: Image.Image, w: int, h: int) -> Image.Image:
    img = img.crop(img.getbbox() or (0, 0, 1, 1))
    out = Image.new("RGBA", (w, h))
    out.alpha_composite(img, ((w - img.width) // 2, h - img.height))
    return out


def build_sprite(gfx: Path, name: str) -> dict:
    """Write deco/<name>.png and return its size; animated sprites are a horizontal strip of frames."""
    path = OUT / "deco" / f"{name}.png"
    if name.startswith("fire"):
        colour = name[5:]
        suffix = f"_{colour}" if colour else ""
        log = Image.open(gfx / "grid" / f"grid_fireplace{suffix}.png").convert("RGBA").crop((0, 0, 32, 32))
        fire = Image.open(gfx / "effects" / f"effect_005_fire{suffix}.png").convert("RGBA")
        strip = Image.new("RGBA", (48 * len(FIRE_FRAMES), 64))
        for i, (fx, fy) in enumerate(FIRE_FRAMES):
            strip.alpha_composite(log, (i * 48 + 8, 32))
            strip.alpha_composite(fire.crop((fx, fy, fx + 48, fy + 48)), (i * 48, 2))
        strip.save(path)
        return {"w": 48, "h": 64, "frames": len(FIRE_FRAMES)}
    if name.startswith("chest-"):
        sheet = Image.open(gfx / "items" / "pick ups" / "pickup_005_chests.png").convert("RGBA")
        bottom_centered(sheet.crop(CHESTS[name[6:]]), 32, 32).save(path)
    elif name == "poop":
        bottom_centered(Image.open(gfx / "grid" / "grid_poop.png").convert("RGBA").crop((0, 0, 32, 32)), 32, 32).save(path)
    else:
        kind, sheet_name = name.split("-", 1)
        sheet = Image.open(gfx / "grid" / f"rocks_{sheet_name}.png").convert("RGBA")
        box = (0, 0, 32, 32) if kind == "rock" else (64, 32, 96, 64)
        bottom_centered(sheet.crop(box), 32, 32).save(path)
    return {"w": 32, "h": 32, "frames": 1}


def build_deco(gfx: Path) -> dict:
    (OUT / "deco").mkdir(parents=True, exist_ok=True)
    names = sorted({n for props in DECO.values() for n in props})
    return {n: build_sprite(gfx, n) for n in names}


# The options menu's Music row (optionsmenu.anm2, animation "Music"): label, cursor arrow and the
# volume slider at levels 0-10, which become one vertical strip.
VOLUME_FRAMES = [(64, 480), (64, 496), (128, 464), (128, 480), (128, 496), (192, 496), (192, 480),
                 (192, 464), (192, 448), (192, 432), (192, 416)]


def build_music_ui(gfx: Path) -> None:
    sheet = Image.open(gfx / "ui" / "main menu" / "optionsmenu.png").convert("RGBA")
    out = OUT / "ui"
    out.mkdir(parents=True, exist_ok=True)
    sheet.crop((0, 460, 60, 480)).save(out / "music-label.png")
    sheet.crop((235, 24, 253, 46)).save(out / "music-arrow.png")
    strip = Image.new("RGBA", (64, 16 * len(VOLUME_FRAMES)))
    for i, (x, y) in enumerate(VOLUME_FRAMES):
        strip.alpha_composite(sheet.crop((x, y, x + 64, y + 16)), (0, i * 16))
    strip.save(out / "music-volume.png")


# Icons for the Lifetime page's counter tiles: (sheet, crop box). HUD sprites are 16x16; pickups are
# trimmed to their first frame; rocks and poop are 32x32 grid tiles.
STAT_ICONS = {
    "coin": ("ui/hudpickups.png", (0, 0, 16, 16)),
    "key": ("ui/hudpickups.png", (16, 0, 32, 16)),
    "goldcoin": ("ui/hudpickups.png", (48, 0, 64, 16)),
    "chest": ("ui/hudpickups.png", (64, 0, 80, 16)),
    "bomb": ("ui/hudpickups.png", (0, 16, 16, 32)),
    "poop": ("ui/hudpickups.png", (80, 16, 96, 32)),
    "heart": ("ui/hudpickups.png", (112, 16, 128, 32)),
    "daily": ("ui/hudpickups.png", (0, 32, 16, 48)),
    "devil": ("ui/hudstats2.png", (48, 0, 64, 16)),
    "angel": ("ui/hudstats2.png", (48, 16, 64, 32)),
    "pill": ("items/pick ups/pickup_007_pill.png", (0, 0, 32, 32)),
    "card": ("items/pick ups/pickup_017_card.png", (0, 0, 32, 32)),
    "battery": ("items/pick ups/pickup_018_littlebattery.png", (0, 0, 32, 32)),
    "rock": ("grid/rocks_basement.png", (0, 0, 32, 32)),
    "rainbowpoop": ("grid/grid_poop_rainbow.png", (0, 0, 32, 32)),
}


def build_stat_icons(gfx: Path) -> list[str]:
    out = OUT / "ui" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    # Every icon is saved ready to draw on a 44px tile: HUD icons (16px) and pickups (~20px) at 2x
    # like the game draws them, the bigger grid sprites (rocks, poop) as they are.
    size = 44
    for name, (sheet, box) in STAT_ICONS.items():
        img = Image.open(gfx / sheet).convert("RGBA").crop(box)
        trimmed = img.crop(img.getbbox() or (0, 0, 1, 1))
        if trimmed.width * 2 <= size and trimmed.height * 2 <= size:
            trimmed = trimmed.resize((trimmed.width * 2, trimmed.height * 2), Image.NEAREST)
        icon = Image.new("RGBA", (size, size))
        icon.alpha_composite(trimmed, ((size - trimmed.width) // 2, (size - trimmed.height) // 2))
        icon.save(out / f"{name}.png")
    return list(STAT_ICONS)


def build_ui(gfx: Path) -> None:
    build_music_ui(gfx)
    ui = gfx / "ui"
    crop(ui / "deedsmenu.png", (7, 224, 311, 436)).save(OUT / "paper.png")       # big folded paper
    crop(ui / "deedsmenu.png", (1, 6, 191, 218)).save(OUT / "note.png")          # small folded paper
    crop(ui / "pausescreen.png", (305, 99, 398, 164)).save(OUT / "card.png")     # blank tan card
    crop(ui / "genericpopup.png", (40, 41, 271, 170)).save(OUT / "popup.png")    # white popup paper
    crop(ui / "popup_beige.png", (1, 10, 220, 27)).save(OUT / "strip.png")       # torn paper strip
    crop(ui / "ui_bosshealthbar.png", (3, 37, 134, 57)).save(OUT / "bar.png")    # boss bar with skull


# ------------------------------------------------------------------------------------------------
# Item icons
# ------------------------------------------------------------------------------------------------

def copy_icons(res: Path) -> tuple[list[int], list[int]]:
    xml = (res / "items.xml").read_text(encoding="utf-8", errors="replace")
    gfx = res / "gfx" / "items"
    files = {p.name.lower(): p for d in ("collectibles", "trinkets") for p in (gfx / d).glob("*.png")}
    items, trinkets = [], []
    for kind, attrs in re.findall(r"<(passive|active|familiar|trinket)\b([^>]*)>", xml):
        id_m, gfx_m = re.search(r'\bid="(\d+)"', attrs), re.search(r'\bgfx="([^"]+)"', attrs)
        if not (id_m and gfx_m):
            continue
        src = files.get(Path(gfx_m.group(1)).name.lower())
        if not src:
            continue
        item_id = int(id_m.group(1))
        folder, ids = ("trinkets", trinkets) if kind == "trinket" else ("items", items)
        (OUT / folder).mkdir(parents=True, exist_ok=True)
        Image.open(src).convert("RGBA").save(OUT / folder / f"{item_id}.png", optimize=True)
        ids.append(item_id)
    return sorted(items), sorted(trinkets)


# ------------------------------------------------------------------------------------------------
# Bitmap fonts (BMFont binary .fnt + page png) -> TrueType, one square per pixel
# ------------------------------------------------------------------------------------------------

def read_bmfont(path: Path) -> dict:
    data = path.read_bytes()
    assert data[:3] == b"BMF", f"{path} isn't a binary BMFont"
    pos, font = 4, {"chars": {}, "pages": []}
    while pos < len(data):
        btype, size = data[pos], struct.unpack_from("<I", data, pos + 1)[0]
        block = data[pos + 5: pos + 5 + size]
        pos += 5 + size
        if btype == 1:
            font["size"] = abs(struct.unpack_from("<h", block, 0)[0])
            font["name"] = block[14:].split(b"\0")[0].decode("latin-1")
        elif btype == 2:
            font["lineHeight"], font["base"] = struct.unpack_from("<HH", block, 0)
        elif btype == 3:
            font["pages"] = [n.decode("latin-1") for n in block.split(b"\0") if n]
        elif btype == 4:
            for i in range(0, len(block), 20):
                cid, x, y, w, h, xo, yo, xa, page, _ = struct.unpack_from("<IHHHHhhhBB", block, i)
                font["chars"][cid] = dict(x=x, y=y, w=w, h=h, xo=xo, yo=yo, xa=xa, page=page)
    return font


def bmfont_to_ttf(fnt: Path, out: Path, family: str) -> None:
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    font = read_bmfont(fnt)
    pages = [Image.open(fnt.parent / p).convert("RGBA") for p in font["pages"]]
    P = 64  # font units per pixel
    base, line = font["base"], font["lineHeight"]

    glyphs, advances, cmap = {}, {}, {}

    def empty_glyph():
        return TTGlyphPen(None).glyph()

    glyphs[".notdef"], advances[".notdef"] = empty_glyph(), (font["size"] // 2 * P, 0)
    for cid, c in sorted(font["chars"].items()):
        name = f"uni{cid:04X}"
        pen = TTGlyphPen(None)
        img = pages[c["page"]].crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
        px = img.load()
        for row in range(c["h"]):
            col = 0
            while col < c["w"]:
                if px[col, row][3] < 128:
                    col += 1
                    continue
                start = col
                while col < c["w"] and px[col, row][3] >= 128:
                    col += 1
                x0, x1 = (c["xo"] + start) * P, (c["xo"] + col) * P
                y1 = (base - (c["yo"] + row)) * P
                y0 = y1 - P
                pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
        glyphs[name] = pen.glyph()
        advances[name] = (max(c["xa"], 0) * P, 0)
        cmap[cid] = name
    # The game's fonts are often caps only: let lowercase fall back to the capitals.
    for cid in range(ord("a"), ord("z") + 1):
        if cid not in cmap and cid - 32 in cmap:
            cmap[cid] = cmap[cid - 32]

    fb = FontBuilder(line * P, isTTF=True)
    order = list(glyphs)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    metrics = {}
    glyf = fb.font["glyf"]
    for n in order:
        g = glyf[n]
        g.recalcBounds(glyf)
        metrics[n] = (advances[n][0], getattr(g, "xMin", 0))
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=base * P, descent=-(line - base) * P)
    fb.setupNameTable({"familyName": family, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=base * P, sTypoDescender=-(line - base) * P, usWinAscent=base * P, usWinDescent=(line - base) * P)
    fb.setupPost()
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(out))
    print(f"  {family}: {len(font['chars'])} glyphs, {font['size']}px, line {line}")


# ------------------------------------------------------------------------------------------------
# For the mod: the entities the bestiary can count (the game has no list of them at runtime)
# ------------------------------------------------------------------------------------------------

MOD_SCRIPTS = Path(__file__).resolve().parent.parent / "mod" / "isaac-run-history" / "scripts"
NOT_IN_BESTIARY = {17, 33, 42, 44, 292, 960, 961, 962, 963, 964}  # shopkeepers, fires, stone heads, TNT...


def write_bestiary_ids(res: Path) -> int:
    xml = (res / "entities2.xml").read_text(encoding="utf-8", errors="replace")
    ids = set()
    for attrs in re.findall(r"<entity\s([^>]*)>", xml):
        t = re.search(r'\sid="(\d+)"', " " + attrs)
        v = re.search(r'\svariant="(\d+)"', " " + attrs)
        no = re.search(r'\sbestiary="false"', " " + attrs)
        if not t or no:
            continue
        etype, var = int(t.group(1)), int(v.group(1)) if v else 0
        if 10 <= etype < 1000 and etype not in NOT_IN_BESTIARY:
            ids.add((etype, var))
    rows = ",\n".join(f"  {{{t}, {v}}}" for t, v in sorted(ids))
    (MOD_SCRIPTS / "bestiary_ids.lua").write_text(
        "-- Generated by tools/extract_assets.py from the game's entities2.xml: every enemy and boss\n"
        "-- (type, variant) the bestiary can have counts for.\n"
        f"return {{\n{rows},\n}}\n", encoding="utf-8")
    return len(ids)


# ------------------------------------------------------------------------------------------------

def main() -> None:
    game = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_GAME
    res = game / "extracted_resources" / "resources"
    if not res.is_dir():
        sys.exit(f"No unpacked resources in {res}. Run the game's tools/ResourceExtractor first.")
    OUT.mkdir(parents=True, exist_ok=True)

    print("rooms, doors, paper, bars")
    for old in ("room.png", "floor.png", "door-left.png", "door-right.png"):
        (OUT / old).unlink(missing_ok=True)
    backgrounds = build_rooms(res / "gfx", res)
    sprites = build_deco(res / "gfx")
    sprites.update(build_details(res / "gfx"))
    icons = build_stat_icons(res / "gfx")
    build_ui(res / "gfx")
    print("fonts")
    bmfont_to_ttf(res / "font" / "teammeatfont16bold.fnt", OUT / "fonts" / "teammeat.ttf", "TeamMeat")
    bmfont_to_ttf(res / "font" / "upheaval.fnt", OUT / "fonts" / "upheaval.ttf", "Upheaval")
    print("item icons")
    items, trinkets = copy_icons(res)
    print(f"  {len(items)} items, {len(trinkets)} trinkets")
    print(f"bestiary ids for the mod: {write_bestiary_ids(res)}")

    (OUT / "manifest.json").write_text(json.dumps({
        "version": 2,
        "backgrounds": backgrounds,
        "defaultBackground": DEFAULT_BACKGROUND,
        "sprites": sprites,
        "icons": icons,
        "items": items,
        "trinkets": trinkets,
    }), encoding="utf-8")
    print(f"done: {OUT}")


if __name__ == "__main__":
    main()
