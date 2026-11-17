"""Draw docs/portfolio-card.png: a 1200x630 card for the portfolio, the dark style of the
portfolio's own card, with the screenshot stack from tools/showcase_stack.py on the right.

    python tools/showcase_stack.py   (first, makes docs/showcase-stack.png)
    python tools/portfolio_card.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
STACK = ROOT / "docs" / "showcase-stack.png"
OUT = ROOT / "docs" / "portfolio-card.png"
FONTS = Path("C:/Windows/Fonts")
W, H = 1200, 630
BG = (10, 13, 24)
BLUE = (59, 130, 246)
WHITE = (240, 244, 255)
GREY = (160, 170, 190)

TAG = "~/projekty"
TITLE = "Isaac Run History"
SUBTITLE = "Mod pro The Binding of Isaac: Repentance+"
QUOTE = ["Zaznamená každý run a udělá z historie", "statistiky: win rate, itemy, smrti, bossové."]
PILL = "tomandes.eu/isaac-run-history"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def glow() -> Image.Image:
    """Blue light from the top right, fading out to the left and down."""
    y, x = [a.astype(float) for a in __import__("numpy").mgrid[0:H, 0:W]]
    d = (((x - W * 1.0) / (W * 0.75)) ** 2 + ((y + H * 0.1) / (H * 1.1)) ** 2) ** 0.5
    a = (1 - d).clip(0, 1) ** 1.6 * 150
    layer = Image.new("RGBA", (W, H), BLUE + (0,))
    layer.putalpha(Image.fromarray(a.astype("uint8")))
    return layer


def main() -> None:
    card = Image.new("RGBA", (W, H), BG + (255,))
    card.alpha_composite(glow())

    # the stack on the right, running off the right edge like the portfolio card
    stack = Image.open(STACK).convert("RGBA")
    scale = 600 / stack.height
    stack = stack.resize((round(stack.width * scale), round(stack.height * scale)), Image.LANCZOS)
    card.alpha_composite(stack, (660, 15))

    draw = ImageDraw.Draw(card)
    x = 72
    draw.text((x, 182), TAG, font=font("CascadiaMono.ttf", 22), fill=BLUE)

    title = font("segoeuib.ttf", 56)
    draw.text((x, 222), TITLE, font=title, fill=WHITE)
    tw = draw.textlength(TITLE, font=title)
    draw.rectangle((x + tw + 8, 290, x + tw + 42, 296), fill=BLUE)

    draw.text((x, 322), SUBTITLE, font=font("seguisb.ttf", 24) if (FONTS / "seguisb.ttf").exists()
              else font("segoeuib.ttf", 24), fill=WHITE)

    draw.rectangle((x, 384, x + 3, 384 + 34 * len(QUOTE) + 4), fill=BLUE)
    q = font("segoeui.ttf", 21)
    for i, line in enumerate(QUOTE):
        draw.text((x + 22, 384 + 34 * i), line, font=q, fill=GREY)

    # link pill, bottom right over the screenshots
    pf = font("CascadiaMono.ttf", 22)
    pw = draw.textlength(PILL, font=pf)
    box = (W - 44 - pw - 36, H - 96, W - 44, H - 40)
    draw.rounded_rectangle(box, 10, fill=(14, 18, 32, 235), outline=(70, 90, 140), width=1)
    draw.text((box[0] + 18, box[1] + 14), PILL, font=pf, fill=WHITE)

    card.convert("RGB").save(OUT, optimize=True)
    print(f"{OUT} ({OUT.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
