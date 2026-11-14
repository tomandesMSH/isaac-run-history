"""Draw web/public/og.png, the picture chat apps and social sites show for a link to the page.

Made from the game graphics tools/extract_assets.py already put in web/public/gfx (room, paper,
fonts, boss portraits), so run that first. 1200x630, the size Open Graph previews use.

    python tools/og_image.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GFX = Path(__file__).resolve().parent.parent / "web" / "public" / "gfx"
OUT = GFX.parent / "og.png"
W, H = 1200, 630
INK = (43, 31, 28, 255)
RED = (180, 24, 20, 255)
BOSSES = [1, 6, 39, 24, 54]  # Monstro, Mom, Isaac, Satan, The Lamb


def nearest(img: Image.Image, scale: float) -> Image.Image:
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.NEAREST)


def main() -> None:
    room = Image.open(GFX / "rooms" / "basement.png").convert("RGBA")
    canvas = nearest(room, max(W / room.width, H / room.height)).crop((0, 0, W, H))
    canvas.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 90)))

    paper = nearest(Image.open(GFX / "paper.png").convert("RGBA"), 3)
    paper = paper.resize((900, 470), Image.NEAREST)
    px, py = (W - paper.width) // 2, 70
    canvas.alpha_composite(paper, (px, py))

    draw = ImageDraw.Draw(canvas)
    title = ImageFont.truetype(str(GFX / "fonts" / "teammeat.ttf"), 76)
    sub = ImageFont.truetype(str(GFX / "fonts" / "upheaval.ttf"), 30)
    def centered(y: int, text: str, font, fill) -> None:
        w = draw.textlength(text, font=font)
        draw.text(((W - w) / 2, y), text, font=font, fill=fill)
    centered(py + 50, "Isaac Run History", title, RED)
    centered(py + 150, "Win rate, items, deaths, bosses", sub, INK)
    centered(py + 190, "for your Repentance+ runs", sub, INK)

    portraits = [Image.open(GFX / "bosses" / f"{i}.png").convert("RGBA") for i in BOSSES]
    portraits = [p.resize((round(p.width * 150 / max(p.size)), round(p.height * 150 / max(p.size))), Image.NEAREST) for p in portraits]
    total = sum(p.width for p in portraits) + 30 * (len(portraits) - 1)
    x = (W - total) // 2
    base = py + paper.height - 50
    for p in portraits:
        canvas.alpha_composite(p, (x, base - p.height))
        x += p.width + 30

    canvas.convert("RGB").save(OUT, optimize=True)
    print(f"{OUT} ({OUT.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
