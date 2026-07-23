#!/usr/bin/env python3
"""Generate Vestra brand favicon set: cream / gold / charcoal V mark."""
from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"

CHARCOAL = (11, 11, 12, 255)  # #0B0B0C
GOLD = (198, 165, 103, 255)  # #C6A567
CREAM = (246, 241, 231, 255)  # #F6F1E7

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]


def load_font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()


def draw_simple_v(draw: ImageDraw.ImageDraw, size: int, color):
    """Chunky geometric V that stays readable at 16×16."""
    # Outer triangle arms as two thick strokes via polygon
    cx = size / 2
    top = size * 0.20
    bottom = size * 0.82
    left = size * 0.16
    right = size * 0.84
    t = max(2.0, size * 0.18)  # thickness

    # Left arm
    draw.polygon(
        [
            (left, top),
            (left + t * 0.85, top),
            (cx + t * 0.15, bottom),
            (cx - t * 0.55, bottom),
        ],
        fill=color,
    )
    # Right arm
    draw.polygon(
        [
            (right - t * 0.85, top),
            (right, top),
            (cx + t * 0.55, bottom),
            (cx - t * 0.15, bottom),
        ],
        fill=color,
    )


def draw_v_mark(size: int, *, cream_ring: bool = True) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = size * 0.18

    if cream_ring and size >= 32:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=CREAM)
        inset = max(2, round(size * 0.05))
        draw.rounded_rectangle(
            [inset, inset, size - 1 - inset, size - 1 - inset],
            radius=max(1, radius - inset * 0.6),
            fill=CHARCOAL,
        )
    else:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=CHARCOAL)

    if size <= 24:
        draw_simple_v(draw, size, GOLD)
    else:
        # Serif V via font — optically centered
        font_size = int(size * 0.62)
        font = load_font(font_size)
        text = "V"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (size - tw) / 2 - bbox[0]
        # Nudge up slightly — serif fonts sit heavy
        y = (size - th) / 2 - bbox[1] - size * 0.03
        draw.text((x, y), text, font=font, fill=GOLD)

    return img.convert("RGB")


def write_png(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    print(f"wrote {path} ({path.stat().st_size}B) {img.size}")


def write_ico(path: Path, img16: Image.Image, img32: Image.Image):
    # Pillow: pass the largest image + sizes list to embed both
    img32.convert("RGBA").save(
        path,
        format="ICO",
        sizes=[(16, 16), (32, 32)],
    )
    # Ensure 16px variant is our crafted one (Pillow rescales from 32 otherwise)
    # Rebuild ICO manually for exact bitmaps
    def png_bytes(im: Image.Image) -> bytes:
        from io import BytesIO

        buf = BytesIO()
        im.convert("RGBA").save(buf, format="PNG")
        return buf.getvalue()

    entries = [
        (16, png_bytes(img16)),
        (32, png_bytes(img32)),
    ]
    # ICONDIR
    out = bytearray()
    out += struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    blobs = []
    for size, blob in entries:
        blobs.append(blob)
        out += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0,
            0,
            1,
            32,
            len(blob),
            offset,
        )
        offset += len(blob)
    for blob in blobs:
        out += blob
    path.write_bytes(out)
    count = struct.unpack_from("<H", out, 4)[0]
    print(f"wrote {path} ({len(out)}B) images={count}")
    assert count == 2


def write_svg(path: Path):
    path.write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Vestra">
  <rect width="64" height="64" rx="12" fill="#F6F1E7"/>
  <rect x="3" y="3" width="58" height="58" rx="10" fill="#0B0B0C"/>
  <text x="32" y="46" text-anchor="middle" font-family="Georgia, 'Liberation Serif', 'Times New Roman', serif" font-size="36" font-weight="700" fill="#C6A567">V</text>
</svg>
"""
    )
    print(f"wrote {path}")


def main():
    ICONS.mkdir(parents=True, exist_ok=True)

    img16 = draw_v_mark(16, cream_ring=False)
    img32 = draw_v_mark(32, cream_ring=True)
    img180 = draw_v_mark(180, cream_ring=True)
    img192 = draw_v_mark(192, cream_ring=True)
    img512 = draw_v_mark(512, cream_ring=True)

    write_png(img16, ICONS / "favicon-16x16.png")
    write_png(img32, ICONS / "favicon-32x32.png")
    write_png(img32, ICONS / "icon-32.png")
    write_png(img180, ICONS / "apple-touch-icon.png")
    write_png(img192, ICONS / "icon-192.png")
    write_png(img512, ICONS / "icon-512.png")
    write_ico(PUBLIC / "favicon.ico", img16, img32)
    write_svg(PUBLIC / "favicon.svg")


if __name__ == "__main__":
    main()
