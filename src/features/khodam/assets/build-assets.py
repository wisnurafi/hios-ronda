#!/usr/bin/env python3
"""One-time asset builder for the khodam game (run at dev time, outputs committed).

1. White variants of the black line-art button icons (black is nearly
   invisible on Discord's dark theme AND in the legend card).
2. legend.png — the 4-button legend strip attached to the game panel.

Zero runtime cost: the bot only reads the committed PNGs.
"""
import glob
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

BLACK_ICONS = ["collection.png", "duel.png", "leaderboard.png"]

CELLS = [
    ("roll.png", "CEK"),
    ("collection_white.png", "KOLEKSI"),
    ("duel_white.png", "DUEL"),
    ("leaderboard_white.png", "RANK"),
]


def white_variant(src_name):
    src = Image.open(os.path.join(HERE, src_name)).convert("RGBA")
    px = src.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                # black line-art -> white, keep alpha (and any shading)
                lum = int(0.299 * r + 0.587 * g + 0.114 * b)
                v = 255 - min(lum, 230)  # pure black -> white
                v = max(v, 235)
                px[x, y] = (v, v, v, a)
    return src


def find_font():
    for pat in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        if os.path.exists(pat):
            return pat
    hits = glob.glob("/usr/share/fonts/**/DejaVuSans-Bold.ttf", recursive=True)
    return hits[0] if hits else None


def build_legend():
    font_path = find_font()
    font = ImageFont.truetype(font_path, 44) if font_path else ImageFont.load_default()

    cell_w, card_h = 300, 380
    img = Image.new("RGBA", (cell_w * 4, card_h), (43, 45, 49, 255))  # discord dark
    draw = ImageDraw.Draw(img)

    for i, (icon_name, label) in enumerate(CELLS):
        icon = Image.open(os.path.join(HERE, icon_name)).convert("RGBA")
        icon.thumbnail((190, 190), Image.LANCZOS)
        cx = i * cell_w + cell_w // 2
        img.alpha_composite(icon, (cx - icon.width // 2, 45))

        bbox = draw.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw // 2, 260), label, font=font, fill=(255, 255, 255, 255))

    img.save(os.path.join(HERE, "legend.png"))
    print("wrote legend.png", img.size)


def main():
    for name in BLACK_ICONS:
        out = name.replace(".png", "_white.png")
        white_variant(name).save(os.path.join(HERE, out))
        print("wrote", out)
    build_legend()


if __name__ == "__main__":
    main()
