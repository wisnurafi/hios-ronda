#!/usr/bin/env python3
"""One-time asset builder for the khodam game (run at dev time, outputs committed).

Builds legend.png — the 4-button legend strip attached to the game panel.

Zero runtime cost: the bot only reads the committed PNGs.
"""
import glob
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

CELLS = [
    ("roll.png", "ROLL"),
    ("collection.png", "KOLEKSI"),
    ("duel.png", "DUEL"),
    ("leaderboard.png", "RANK"),
]


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
    build_legend()


if __name__ == "__main__":
    main()
