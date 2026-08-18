#!/usr/bin/env python3
"""Build Chrome Web Store listing images (exact pixel sizes).

Run from the repo root:  python3 store/make-assets.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STORE = Path(__file__).resolve().parent
SHOTS = STORE / "screenshots"
PROMO = STORE / "promo"

ACCENT = (47, 111, 78)
ACCENT_SOFT = (62, 175, 124)
BG = (233, 241, 236)
INK = (27, 45, 36)
MUTED = (90, 110, 98)
WHITE = (255, 255, 255)
SHADOW = (20, 40, 30)

SOURCES = [
    ("public/image-1782547092964.jpg", "01-reader-light.png"),
    ("public/image-1782547131784.jpg", "02-reader-dark.png"),
    ("public/image-1782547105837.jpg", "03-math-diagrams.png"),
    ("public/image-1782547099281.jpg", "04-confluence.png"),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = "/System/Library/Fonts/Hiragino Sans GB.ttc"
    index = 2 if bold else 0
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


def rounded(im: Image.Image, radius: int) -> Image.Image:
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), radius, fill=255)
    im.putalpha(mask)
    return im


def shadow_behind(canvas: Image.Image, im: Image.Image, xy: tuple[int, int], blur: int = 22) -> None:
    x, y = xy
    pad = blur * 2
    layer = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, SHADOW + (90,))
    sh.putalpha(im.getchannel("A") if im.mode == "RGBA" else Image.new("L", im.size, 255))
    layer.paste(sh, (pad, pad + 8), sh)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer, (x - pad, y - pad))
    canvas.alpha_composite(im.convert("RGBA"), (x, y))


def resize_screenshots() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    for src_name, dest_name in SOURCES:
        src = Image.open(ROOT / src_name).convert("RGB")
        out = src.resize((1280, 800), Image.Resampling.LANCZOS)
        dest = SHOTS / dest_name
        out.save(dest, "PNG", optimize=True)
        print(f"screenshot {dest.relative_to(ROOT)} {out.size}")


def copy_icon() -> None:
    dest = STORE / "icon-128.png"
    Image.open(ROOT / "icons/icon128.png").save(dest, "PNG")
    print(f"icon {dest.relative_to(ROOT)}")


def make_tile() -> None:
    PROMO.mkdir(parents=True, exist_ok=True)
    w, h = 440, 280
    im = Image.new("RGBA", (w, h), BG + (255,))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 0, fill=BG)

    icon = Image.open(ROOT / "icons/icon128.png").convert("RGBA").resize((88, 88), Image.Resampling.LANCZOS)
    im.alpha_composite(icon, (36, 96))

    title = font(28, bold=True)
    sub = font(16, bold=False)
    d.text((140, 108), "Leaflet Mark View", font=title, fill=INK)
    d.text((140, 150), "本地 Markdown 阅读器", font=sub, fill=MUTED)

    pill = (36, 214, 404, 248)
    d.rounded_rectangle(pill, 14, fill=ACCENT)
    d.text((52, 220), "文件留在本机 · 公式与流程图本地渲染", font=font(13), fill=WHITE)

    dest = PROMO / "tile-440x280.png"
    im.convert("RGB").save(dest, "PNG", optimize=True)
    print(f"promo {dest.relative_to(ROOT)} {im.size}")


def make_marquee() -> None:
    PROMO.mkdir(parents=True, exist_ok=True)
    w, h = 1400, 560
    im = Image.new("RGBA", (w, h), BG + (255,))
    d = ImageDraw.Draw(im)

    # Soft accent blob on the left
    blob = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blob)
    bd.ellipse((-80, -120, 620, 680), fill=ACCENT_SOFT + (38,))
    im.alpha_composite(blob)

    icon = Image.open(ROOT / "icons/icon128.png").convert("RGBA").resize((108, 108), Image.Resampling.LANCZOS)
    im.alpha_composite(icon, (72, 88))

    d.text((72, 220), "Leaflet Mark View", font=font(46, bold=True), fill=INK)
    d.text((72, 286), "在 Chrome 里，安静地读你的 Markdown。", font=font(22), fill=MUTED)
    d.text((72, 328), "本地文件夹 · GitHub · 公式 · 流程图 · 导出", font=font(18), fill=ACCENT)

    chips = [
        (72, 392, "不上传文件"),
        (196, 392, "KaTeX / Mermaid / PlantUML"),
        (72, 440, "HTML · Word · Confluence"),
    ]
    for x, y, label in chips:
        tw = font(14).getlength(label)
        box = (x, y, int(x + tw + 28), y + 36)
        d.rounded_rectangle(box, 18, fill=WHITE, outline=(200, 214, 206))
        d.text((x + 14, y + 8), label, font=font(14), fill=INK)

    shot = Image.open(SHOTS / "01-reader-light.png").convert("RGB")
    shot = shot.resize((820, 512), Image.Resampling.LANCZOS)
    shot = rounded(shot, 18)
    shadow_behind(im, shot, (560, 36), blur=26)

    dest = PROMO / "marquee-1400x560.png"
    im.convert("RGB").save(dest, "PNG", optimize=True)
    print(f"promo {dest.relative_to(ROOT)} {im.size}")


def main() -> None:
    copy_icon()
    resize_screenshots()
    make_tile()
    make_marquee()


if __name__ == "__main__":
    main()
