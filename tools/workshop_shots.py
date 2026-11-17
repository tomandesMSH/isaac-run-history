"""Draw the Steam Workshop screenshots into docs/workshop/: each 4K page screenshot from
docs/screenshots/4k (1920x1080 page at 2x), dimmed, with one detail zoomed in on top and a hook on a
torn paper label in the page's own style.

    python tools/workshop_shots.py           blank labels, for your own text
    python tools/workshop_shots.py --text    hooks written on the labels
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots" / "4k"
GFX = ROOT / "web" / "public" / "gfx"
OUT = ROOT / "docs" / "workshop"
W, H = 1920, 1080
INK = (43, 31, 28)
RED = (180, 24, 20)

# screenshot, detail to zoom (x0, y0, x1, y1 in page pixels, 1920x1080), where the zoom's centre goes,
# hook: (first line, second line); the second line is drawn in red
SLIDES = [
    ("web-statistics.jpg", (620, 262, 826, 470), (1560, 470), ("YOUR RUNS,", "BY THE NUMBERS")),
    ("web-run.jpg", (400, 230, 800, 420), (1480, 640), ("EVERY RUN,", "EVERY DETAIL")),
    ("web-items.jpg", (830, 450, 955, 650), (1590, 520), ("WHICH ITEMS", "WIN YOU RUNS?")),
    ("web-bosses.jpg", (1095, 450, 1245, 745), (1620, 520), ("EVERY BOSS", "YOU'VE BEATEN")),
    ("web-lifetime.jpg", (1262, 212, 1530, 365), (1590, 680), ("YOUR WHOLE SAVE,", "AT A GLANCE")),
]
ZOOM_MAX = (560, 520)
# the hook is written on the label only with --text; without it the label is left blank
TEXT = False


def nine_slice(src: Image.Image, border: int, size: tuple[int, int], scale: int) -> Image.Image:
    """Stretch a border-image like CSS does, keeping the pixel art crisp."""
    s = src.resize((src.width * scale, src.height * scale), Image.NEAREST)
    b, (w, h) = border * scale, size
    out = Image.new("RGBA", size)
    xs = [(0, b, 0, b), (b, s.width - b, b, w - b), (s.width - b, s.width, w - b, w)]
    ys = [(0, b, 0, b), (b, s.height - b, b, h - b), (s.height - b, s.height, h - b, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if dx1 > dx0 and dy1 > dy0:
                part = s.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST)
                out.alpha_composite(part, (dx0, dy0))
    return out


def shadowed(layer: Image.Image, offset: int = 12, blur: int = 14) -> Image.Image:
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sh.putalpha(layer.getchannel("A").point(lambda a: a * 0.7))
    return sh.filter(ImageFilter.GaussianBlur(blur)), offset


def slide(name, region, centre, hook) -> Image.Image:
    src = Image.open(SHOTS / name).convert("RGB")
    k = src.width / W  # screenshot pixels per page pixel
    bg = src.resize((W, H), Image.LANCZOS)
    canvas = ImageEnhance.Brightness(bg).enhance(0.55).convert("RGBA")

    # the detail where it is on the page: full brightness, red frame
    x0, y0, x1, y1 = region
    box = list(region)
    canvas.paste(bg.crop(box), box[:2])

    # the zoom
    det = src.crop(tuple(round(v * k) for v in region))
    z = min(ZOOM_MAX[0] / det.width, ZOOM_MAX[1] / det.height)
    det = det.resize((round(det.width * z), round(det.height * z)), Image.LANCZOS).convert("RGBA")
    frame = Image.new("RGBA", (det.width + 16, det.height + 16), (240, 230, 210, 255))
    frame.alpha_composite(det, (8, 8))
    ImageDraw.Draw(frame).rectangle((0, 0, frame.width - 1, frame.height - 1), outline=RED, width=4)
    fx, fy = centre[0] - frame.width // 2, centre[1] - frame.height // 2

    d = ImageDraw.Draw(canvas)
    if fy > box[3]:  # zoom below the detail: join the bottom corners to its top corners
        pairs = [((box[0], box[3]), (fx, fy)), ((box[2], box[3]), (fx + frame.width, fy))]
    else:  # zoom to the right
        pairs = [((box[2], box[1]), (fx, fy)), ((box[2], box[3]), (fx, fy + frame.height))]
    for a, b in pairs:
        d.line([a, b], fill=RED + (200,), width=3)
    d.rectangle(box, outline=RED, width=4)

    sh, off = shadowed(frame)
    canvas.alpha_composite(sh, (fx + off, fy + off))
    canvas.alpha_composite(frame, (fx, fy))

    # the hook on a torn paper label, slightly tilted
    font = ImageFont.truetype(str(GFX / "fonts" / "teammeat.ttf"), 90)
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    tw = max(probe.textlength(t, font=font) for t in hook)
    label = nine_slice(Image.open(GFX / "card.png").convert("RGBA"), 6, (round(tw) + 120, 320), 4)
    if TEXT:
        ld = ImageDraw.Draw(label)
        ld.text((60, 160), hook[0], font=font, fill=INK, anchor="ls")
        ld.text((60, 268), hook[1], font=font, fill=RED, anchor="ls")
    label = label.rotate(2.5, expand=True, resample=Image.BICUBIC)
    lx, ly = 60, H - label.height - 50
    sh, off = shadowed(label)
    canvas.alpha_composite(sh, (lx + off, ly + off))
    canvas.alpha_composite(label, (lx, ly))
    return canvas.convert("RGB")


def main() -> None:
    global TEXT
    TEXT = "--text" in sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    for i, (name, region, centre, hook) in enumerate(SLIDES, 1):
        path = OUT / f"{i}-{Path(name).stem.removeprefix('web-')}.jpg"
        slide(name, region, centre, hook).save(path, quality=92)
        print(path)


if __name__ == "__main__":
    main()
