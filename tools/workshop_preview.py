"""Draw docs/workshop-preview.png, the Steam Workshop thumbnail (pick it in ModUploader).

Same look as tools/og_image.py, square: Steam shows Workshop previews as squares. Made from the
game graphics tools/extract_assets.py put in web/public/gfx, so run that first.

    python tools/workshop_preview.py            docs/workshop-preview.png
    python tools/workshop_preview.py --no-text  docs/workshop-preview-blank.png (add your own text)
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
GFX = ROOT / "web" / "public" / "gfx"
S = 512
INK = (43, 31, 28, 255)
RED = (180, 24, 20, 255)
BOSSES = [1, 39, 24, 54]  # Monstro, Isaac, Satan, The Lamb


def nearest(img: Image.Image, scale: float) -> Image.Image:
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.NEAREST)


def main() -> None:
    text = "--no-text" not in sys.argv[1:]
    out = ROOT / "docs" / ("workshop-preview.png" if text else "workshop-preview-blank.png")
    room = Image.open(GFX / "rooms" / "basement.png").convert("RGBA")
    canvas = nearest(room, max(S / room.width, S / room.height))
    left = (canvas.width - S) // 2
    canvas = canvas.crop((left, 0, left + S, S))
    canvas.alpha_composite(Image.new("RGBA", (S, S), (0, 0, 0, 90)))

    paper = Image.open(GFX / "paper.png").convert("RGBA").resize((452, 440), Image.NEAREST)
    px, py = (S - paper.width) // 2, (S - paper.height) // 2
    canvas.alpha_composite(paper, (px, py))

    draw = ImageDraw.Draw(canvas)
    title = ImageFont.truetype(str(GFX / "fonts" / "teammeat.ttf"), 64)
    sub = ImageFont.truetype(str(GFX / "fonts" / "upheaval.ttf"), 26)

    def centered(y: int, text: str, font, fill) -> None:
        w = draw.textlength(text, font=font)
        draw.text(((S - w) / 2, y), text, font=font, fill=fill)

    if text:
        centered(py + 40, "Isaac", title, RED)
        centered(py + 110, "Run History", title, RED)
        centered(py + 200, "Win rate, items,", sub, INK)
        centered(py + 232, "deaths, bosses", sub, INK)

    portraits = [Image.open(GFX / "bosses" / f"{i}.png").convert("RGBA") for i in BOSSES]
    portraits = [nearest(p, 92 / max(p.size)) for p in portraits]
    gap = 10
    total = sum(p.width for p in portraits) + gap * (len(portraits) - 1)
    x = (S - total) // 2
    base = py + paper.height - 40
    for p in portraits:
        canvas.alpha_composite(p, (x, base - p.height))
        x += p.width + gap

    out.parent.mkdir(exist_ok=True)
    canvas.convert("RGB").save(out, optimize=True)
    print(f"{out} ({out.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
