#!/usr/bin/env python3
"""Build Chrome Web Store listing images (exact pixel sizes).

Run from the repo root:  python3 store/make-assets.py

Sources (your Retina captures) live in store/promo/raw/.
This script cover-crops them to the sizes the store accepts.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STORE = Path(__file__).resolve().parent
SHOTS = STORE / "screenshots"
PROMO = STORE / "promo"
RAW = PROMO / "raw"

# Chrome Web Store listing sizes
SHOT_SIZE = (1280, 800)
TILE_SIZE = (440, 280)
MARQUEE_SIZE = (1400, 560)

# Your captures → store screenshot slots (max 5).
CAPTURES = [
    ("image.png", "01-start.png"),
    ("image copy.png", "02-reader.png"),
    ("image copy 2.png", "03-settings.png"),
    ("image copy 3.png", "04-search.png"),
    ("image copy 4.png", "05-confluence.png"),
]
TILE_SRC = "image copy 5.png"
MARQUEE_SRC = "image copy.png"

ACCENT = (47, 111, 78)
ACCENT_SOFT = (62, 175, 124)
BG = (233, 241, 236)
INK = (27, 45, 36)
MUTED = (90, 110, 98)
WHITE = (255, 255, 255)
SHADOW = (20, 40, 30)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = "/System/Library/Fonts/Hiragino Sans GB.ttc"
    index = 2 if bold else 0
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


def cover_crop(im: Image.Image, size: tuple[int, int], bias_y: float = 0.42) -> Image.Image:
    """Scale to cover target, then crop. bias_y 0=top, 0.5=center, 1=bottom."""
    tw, th = size
    im = im.convert("RGB")
    scale = max(tw / im.width, th / im.height)
    nw = max(tw, round(im.width * scale))
    nh = max(th, round(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, (nw - tw) // 2)
    top = max(0, round((nh - th) * bias_y))
    top = min(top, nh - th)
    return im.crop((left, top, left + tw, top + th))


def gather_raw() -> None:
    """Keep Finder-named captures out of the upload folder."""
    RAW.mkdir(parents=True, exist_ok=True)
    names = [src for src, _ in CAPTURES] + [TILE_SRC, MARQUEE_SRC]
    for name in names:
        src = PROMO / name
        dest = RAW / name
        if src.exists() and src.resolve() != dest.resolve():
            shutil.move(str(src), str(dest))
            print(f"raw {dest.relative_to(ROOT)}")


def resolve_src(name: str) -> Path:
    for folder in (RAW, PROMO):
        path = folder / name
        if path.exists():
            return path
    raise FileNotFoundError(name)


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
    for old in SHOTS.glob("*.png"):
        old.unlink()
    for src_name, dest_name in CAPTURES:
        src = Image.open(resolve_src(src_name))
        out = cover_crop(src, SHOT_SIZE, bias_y=0.38)
        dest = SHOTS / dest_name
        out.save(dest, "PNG", optimize=True)
        print(f"screenshot {dest.relative_to(ROOT)} {out.size}")


def copy_icon() -> None:
    dest = STORE / "icon-128.png"
    Image.open(ROOT / "icons/icon128.png").save(dest, "PNG")
    print(f"icon {dest.relative_to(ROOT)} {Image.open(dest).size}")


def make_tile() -> None:
    PROMO.mkdir(parents=True, exist_ok=True)
    src = Image.open(resolve_src(TILE_SRC))
    out = cover_crop(src, TILE_SIZE, bias_y=0.45)
    dest = PROMO / "tile-440x280.png"
    out.save(dest, "PNG", optimize=True)
    print(f"promo {dest.relative_to(ROOT)} {out.size}")


def make_marquee() -> None:
    PROMO.mkdir(parents=True, exist_ok=True)
    w, h = MARQUEE_SIZE
    im = Image.new("RGBA", (w, h), BG + (255,))
    d = ImageDraw.Draw(im)

    blob = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(blob).ellipse((-80, -120, 620, 680), fill=ACCENT_SOFT + (38,))
    im.alpha_composite(blob)

    icon = Image.open(ROOT / "icons/icon128.png").convert("RGBA").resize(
        (108, 108), Image.Resampling.LANCZOS
    )
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

    shot = cover_crop(Image.open(resolve_src(MARQUEE_SRC)), (1280, 800), bias_y=0.38)
    shot = shot.resize((820, 512), Image.Resampling.LANCZOS)
    shot = rounded(shot, 18)
    shadow_behind(im, shot, (560, 36), blur=26)

    dest = PROMO / "marquee-1400x560.png"
    im.convert("RGB").save(dest, "PNG", optimize=True)
    print(f"promo {dest.relative_to(ROOT)} {im.size}")


def main() -> None:
    gather_raw()
    copy_icon()
    resize_screenshots()
    make_tile()
    make_marquee()


if __name__ == "__main__":
    main()
