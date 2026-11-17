"""Draw docs/showcase-stack.png: three screenshots of the statistics page stacked like cards
(the back ones tilted away, the front one flat), on a transparent background, for a portfolio
or a Workshop banner.

    python tools/showcase_stack.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "docs" / "showcase-stack.png"
W, H = 1600, 1000
RADIUS = 18
BORDER = (255, 255, 255, 40)

# (screenshot, corners TL TR BR BL on the canvas, brightness); drawn back to front
CARDS = [
    ("web-lifetime.jpg", [(700, 70), (1580, 10), (1580, 560), (700, 540)], 0.55),
    ("web-items.jpg", [(480, 230), (1330, 200), (1330, 690), (480, 670)], 0.75),
    ("web-statistics.jpg", [(30, 440), (1050, 440), (1050, 931), (30, 931)], 1.0),
]


def rounded(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), RADIUS, fill=255)
    img.putalpha(mask)
    ImageDraw.Draw(img).rounded_rectangle((0, 0, img.width - 1, img.height - 1), RADIUS, outline=BORDER, width=2)
    return img


def warp(img: Image.Image, quad: list[tuple[int, int]]) -> Image.Image:
    """Map img onto the canvas so its corners land on quad (PIL wants the inverse mapping)."""
    src = [(0, 0), (img.width, 0), (img.width, img.height), (0, img.height)]
    rows, rhs = [], []
    for (x, y), (u, v) in zip(quad, src):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.append(u)
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.append(v)
    coeffs = np.linalg.solve(np.array(rows, float), np.array(rhs, float))
    return img.transform((W, H), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)


def main() -> None:
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for name, quad, light in CARDS:
        shot = Image.open(SHOTS / name).convert("RGB")
        shot = ImageEnhance.Brightness(shot).enhance(light)
        card = warp(rounded(shot), quad)
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        shadow.putalpha(card.getchannel("A").point(lambda a: a * 0.6))
        shadow = shadow.filter(ImageFilter.GaussianBlur(24))
        canvas.alpha_composite(shadow, (0, 16))
        canvas.alpha_composite(card)
    canvas = canvas.crop(canvas.getbbox())
    canvas.save(OUT, optimize=True)
    print(f"{OUT} {canvas.size} ({OUT.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
