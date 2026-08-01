#!/usr/bin/env python3
"""
Generates the demo vault's cover images.

Why generate them: the takes are published on YouTube, and a real book or album
cover is someone's copyright. These are original geometric artwork carrying the
work's title as a label — no reproduction of the published designs, nothing to
retract later. Deliberately abstract: they read as covers on screen without
imitating anyone's.

    python3 tools/make-covers.py <output-dir>

Pillow only; no network, no fonts beyond the system ones.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# macOS ships these; the fallback keeps the script working headless.
FONTS = [
    "/System/Library/Fonts/Supplemental/Futura.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def centred(draw: ImageDraw.ImageDraw, text: str, y: int, f, fill, width: int) -> None:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
    draw.text(((width - (right - left)) / 2 - left, y), text, font=f, fill=fill)


def label(img: Image.Image, title: str, author: str, colour) -> None:
    """Title and author, bottom-centred, in the plate's own ink."""
    d = ImageDraw.Draw(img)
    w, h = img.size
    centred(d, title.upper(), int(h * 0.80), font(int(w * 0.085)), colour, w)
    if author:
        centred(d, author, int(h * 0.885), font(int(w * 0.042)), colour, w)


def dune(w=1000, h=1500) -> Image.Image:
    """Sand bands, and one figure that gives them scale."""
    img = Image.new("RGB", (w, h), (222, 184, 122))
    d = ImageDraw.Draw(img)
    for i, (y, shade) in enumerate(
        [(0.16, (208, 162, 96)), (0.30, (196, 146, 82)), (0.46, (180, 128, 70))]
    ):
        d.ellipse(
            [-w * 0.5 + i * w * 0.2, h * y, w * 1.4 - i * w * 0.1, h * (y + 0.55)],
            fill=shade,
        )
    d.ellipse([w * 0.47, h * 0.60, w * 0.505, h * 0.655], fill=(60, 40, 28))
    label(img, "Dune", "Frank Herbert", (54, 36, 24))
    return img


def rings(w=1000, h=1500) -> Image.Image:
    """One thin circle on a dark field — a ring, drawn as a ring and nothing more."""
    img = Image.new("RGB", (w, h), (28, 40, 34))
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.28, h * 0.20, w * 0.72, h * 0.49], outline=(206, 172, 92), width=int(w * 0.018))
    d.ellipse([w * 0.36, h * 0.255, w * 0.64, h * 0.44], outline=(120, 100, 58), width=int(w * 0.005))
    label(img, "The Lord of the Rings", "J.R.R. Tolkien", (222, 206, 168))
    return img


def peak(w=1000, h=1500) -> Image.Image:
    """A summit against cold sky."""
    img = Image.new("RGB", (w, h), (206, 226, 240))
    d = ImageDraw.Draw(img)
    d.polygon([(w * 0.5, h * 0.18), (w * 0.94, h * 0.66), (w * 0.06, h * 0.66)], fill=(238, 244, 250))
    d.polygon([(w * 0.5, h * 0.18), (w * 0.63, h * 0.36), (w * 0.37, h * 0.36)], fill=(255, 255, 255))
    d.line([(w * 0.06, h * 0.66), (w * 0.94, h * 0.66)], fill=(150, 176, 196), width=int(w * 0.006))
    label(img, "Tintin in Tibet", "Hergé", (44, 66, 84))
    return img


def blue(w=1200, h=1200) -> Image.Image:
    """Two blues, offset. Sleeve-square, as an album is."""
    img = Image.new("RGB", (w, h), (18, 40, 78))
    d = ImageDraw.Draw(img)
    d.rectangle([w * 0.10, h * 0.12, w * 0.72, h * 0.52], fill=(52, 96, 150))
    d.rectangle([w * 0.30, h * 0.30, w * 0.90, h * 0.62], fill=(96, 148, 196))
    label(img, "Kind of Blue", "Miles Davis", (222, 232, 244))
    return img


def habits(w=1000, h=1500) -> Image.Image:
    """Small squares compounding — the book's own argument."""
    img = Image.new("RGB", (w, h), (244, 240, 232))
    d = ImageDraw.Draw(img)
    x, y, size = w * 0.12, h * 0.44, w * 0.02
    for i in range(9):
        d.rectangle([x, y - size, x + size, y], fill=(40, 44, 52))
        x += size + w * 0.012
        size *= 1.32
    label(img, "Atomic Habits", "James Clear", (40, 44, 52))
    return img


PLATES = {
    "Dune.png": dune,
    "The Lord of the Rings.png": rings,
    "Tintin in Tibet.png": peak,
    "Kind of Blue.png": blue,
    "Atomic Habits.png": habits,
}


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    for name, plate in PLATES.items():
        path = out / name
        plate().save(path, "PNG", optimize=True)
        print(f"{path}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
