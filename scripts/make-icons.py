"""Genera los iconos de la PWA de Al Fin Desayuno (pizarra con imanes)."""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "web", "public", "icons")
S = 1024
BLUE = (29, 63, 191, 255)
WHITE = (255, 255, 255, 255)
RED = (229, 72, 58, 255)
YOLK = (242, 178, 27, 255)


def artwork(scale: float = 1.0, rounded: bool = True) -> Image.Image:
    image = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle([0, 0, S, S], radius=int(S * 14 / 64), fill=BLUE)
    else:
        draw.rectangle([0, 0, S, S], fill=BLUE)
    f = S / 64

    def p(x: float, y: float) -> tuple[float, float]:
        return ((x - 32) * f * scale + S / 2, (y - 32) * f * scale + S / 2)

    def r(v: float) -> float:
        return v * f * scale

    draw.rounded_rectangle([p(9, 12), p(55, 46)], radius=r(5), fill=WHITE)
    for x0, x1, y in ((17, 34, 24), (17, 28, 33)):
        draw.line([p(x0, y), p(x1, y)], fill=BLUE, width=int(r(4)))
        for x in (x0, x1):
            cx, cy = p(x, y)
            draw.ellipse([cx - r(2), cy - r(2), cx + r(2), cy + r(2)], fill=BLUE)
    for cx, cy, color in ((44, 23, RED), (41, 35, YOLK)):
        x, y = p(cx, cy)
        draw.ellipse([x - r(5.5), y - r(5.5), x + r(5.5), y + r(5.5)], fill=color)
    for x in (20, 44):
        draw.line([p(x, 46), p(x, 52)], fill=WHITE, width=int(r(3.5)))
    return image


def save(image: Image.Image, name: str, size: int) -> None:
    image.resize((size, size), Image.LANCZOS).save(os.path.join(OUT_DIR, name))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    icon = artwork()
    save(icon, "icon-192.png", 192)
    save(icon, "icon-512.png", 512)
    save(icon, "favicon-32.png", 32)
    full = artwork(rounded=False)
    save(full, "apple-touch-icon.png", 180)
    save(artwork(scale=0.78, rounded=False), "icon-maskable-512.png", 512)


if __name__ == "__main__":
    main()
