"""Draw docs/badges/github.png and steam.png: "get it on" buttons in the page's Isaac style
(torn paper card, pixel fonts, pixelated logo), on a transparent background.

Everything is drawn at 1 px per game pixel and blown up with nearest neighbour at the end, so
the fonts stay on their pixel grid (TeamMeat 25 px, Upheaval 18 px) and nothing is blurry.
The logos come from the standard badges in docs/badges/src-*.png.

    python tools/badges.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
GFX = ROOT / "web" / "public" / "gfx"
DIR = ROOT / "docs" / "badges"
SCALE = 4
INK = (43, 31, 28, 255)
RED = (180, 24, 20, 255)
LOGO = 30  # logo size in game pixels

# name, logo disc box in the source badge, small line, big line
BADGES = [
    ("github", (71, 64, 191, 181), "GET IT ON", "GITHUB"),
    ("steam", (97, 65, 210, 184), "DOWNLOAD ON", "STEAM"),
]


def nine_slice(src: Image.Image, border: int, size: tuple[int, int]) -> Image.Image:
    b, (w, h) = border, size
    out = Image.new("RGBA", size)
    xs = [(0, b, 0, b), (b, src.width - b, b, w - b), (src.width - b, src.width, w - b, w)]
    ys = [(0, b, 0, b), (b, src.height - b, b, h - b), (src.height - b, src.height, h - b, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            part = src.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST)
            out.alpha_composite(part, (dx0, dy0))
    return out


def logo(src: Path, box: tuple[int, int, int, int]) -> Image.Image:
    """The white disc of the source badge (logo cut out of it) as a pixelated ink stamp."""
    grey = Image.open(src).convert("L").crop(box).resize((LOGO, LOGO), Image.LANCZOS)
    a = (np.array(grey) > 140).astype("uint8") * 255
    out = Image.new("RGBA", (LOGO, LOGO), INK)
    out.putalpha(Image.fromarray(a))
    return out


def text_img(text: str, font: ImageFont.FreeTypeFont, fill) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    probe.fontmode = "1"
    x0, y0, x1, y1 = probe.textbbox((0, 0), text, font=font)
    img = Image.new("RGBA", (x1 - x0, y1 - y0))
    d = ImageDraw.Draw(img)
    d.fontmode = "1"  # no anti-aliasing: hard pixels like the game
    d.text((-x0, -y0), text, font=font, fill=fill)
    return img


def badge(name: str, box, small: str, big: str) -> Image.Image:
    small_t = text_img(small, ImageFont.truetype(str(GFX / "fonts" / "upheaval.ttf"), 18), INK)
    big_t = text_img(big, ImageFont.truetype(str(GFX / "fonts" / "teammeat.ttf"), 25), RED)
    mark = logo(DIR / f"src-{name}.png", box)

    pad, gap = 10, 8
    tw = max(small_t.width, big_t.width)
    w = pad + mark.width + gap + tw + pad + 2
    h = max(mark.height, small_t.height + 3 + big_t.height) + 2 * pad
    card = nine_slice(Image.open(GFX / "card.png").convert("RGBA"), 6, (w, h))
    card.alpha_composite(mark, (pad, (h - mark.height) // 2))
    tx = pad + mark.width + gap
    ty = (h - (small_t.height + 3 + big_t.height)) // 2
    card.alpha_composite(small_t, (tx, ty))
    card.alpha_composite(big_t, (tx, ty + small_t.height + 3))
    return card.resize((w * SCALE, h * SCALE), Image.NEAREST)


def main() -> None:
    for name, box, small, big in BADGES:
        out = DIR / f"{name}.png"
        badge(name, box, small, big).save(out, optimize=True)
        print(out, Image.open(out).size)


if __name__ == "__main__":
    main()
