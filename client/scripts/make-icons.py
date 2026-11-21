"""Generates the 51 Okey app icons (master, Android mipmaps, web icons, splash).
Run from anywhere: py -3 client/scripts/make-icons.py   (requires Pillow)"""
import math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENT = os.path.dirname(HERE)
RES = os.path.join(CLIENT, "android", "app", "src", "main", "res")
PUB = os.path.join(CLIENT, "public")
GREEN = (14, 92, 58)
GREEN_DARK = (5, 38, 24)
GOLD = (222, 186, 98)
RED = (200, 30, 40)
FONT = next(f for f in ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/seguibl.ttf"] if os.path.exists(f))
SS = 2  # supersampling


def felt(w, h):
    """Green felt with subtle radial gradient (light centre, dark edges)."""
    sw, sh = max(w // 4, 8), max(h // 4, 8)
    img = Image.new("RGB", (sw, sh))
    px = img.load()
    cx, cy, rmax = sw / 2, sh * 0.45, math.hypot(sw, sh) * 0.55
    for y in range(sh):
        for x in range(sw):
            t = min(math.hypot(x - cx, y - cy) / rmax, 1) ** 1.3
            px[x, y] = tuple(int(GREEN[i] * 1.18 * (1 - t) + GREEN_DARK[i] * t) if True else 0 for i in range(3))
    return img.resize((w, h), Image.BICUBIC).convert("RGBA")


def heart(d, cx, cy, size, fill):
    pts = []
    for i in range(240):
        t = i / 240 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * size / 34, cy + y * size / 34))
    d.polygon(pts, fill=fill)


def tile(n, tile_h, angle=-8):
    """Transparent n x n canvas with a tilted ivory tile (51 + heart) centred on it."""
    N = n * SS
    th = tile_h * SS
    tw = th * 0.74
    pad = int(th * 0.3)
    W, H = int(tw + pad * 2), int(th + pad * 2)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x0, y0 = pad, pad
    r = tw * 0.13
    depth = th * 0.045
    d = ImageDraw.Draw(layer)
    # tile thickness (darker ivory edge below)
    d.rounded_rectangle([x0, y0 + depth, x0 + tw, y0 + th + depth], r, fill=(176, 150, 98, 255))
    # face with vertical gradient
    face = Image.new("RGBA", (int(tw), int(th)), (0, 0, 0, 0))
    fp = face.load()
    for y in range(int(th)):
        k = y / th
        c = (int(252 - 22 * k), int(247 - 28 * k), int(232 - 40 * k), 255)
        for x in range(int(tw)):
            fp[x, y] = c
    mask = Image.new("L", face.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw - 1, th - 1], r, fill=255)
    layer.paste(face, (int(x0), int(y0)), mask)
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([x0 + tw * 0.04, y0 + tw * 0.04, x0 + tw * 0.96, y0 + th - tw * 0.04], r * 0.8,
                        outline=(205, 188, 150, 255), width=max(1, int(th * 0.008)))
    # "51"
    font = ImageFont.truetype(FONT, int(th * 0.56))
    bbox = d.textbbox((0, 0), "51", font=font)
    tx = x0 + (tw - (bbox[2] - bbox[0])) / 2 - bbox[0]
    ty = y0 + th * 0.12 - bbox[1]
    d.text((tx + th * 0.01, ty + th * 0.012), "51", font=font, fill=(120, 15, 22, 255))
    d.text((tx, ty), "51", font=font, fill=RED + (255,))
    heart(d, x0 + tw / 2, y0 + th * 0.78, tw * 0.3, RED + (255,))
    # shadow
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sm = Image.new("L", layer.size, 0)
    ImageDraw.Draw(sm).rounded_rectangle([x0, y0 + depth, x0 + tw, y0 + th + depth], r, fill=150)
    sh.putalpha(sm)
    sh = sh.filter(ImageFilter.GaussianBlur(th * 0.03))
    full = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    full.alpha_composite(sh, (int(th * 0.02), int(th * 0.035)))
    full.alpha_composite(layer)
    full = full.rotate(angle, resample=Image.BICUBIC, expand=True)
    out = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    out.alpha_composite(full, ((N - full.width) // 2, (N - full.height) // 2))
    return out.resize((n, n), Image.LANCZOS)


def ring(img, inset_frac, width_frac, shape="round"):
    S = img.width * SS
    big = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    i = S * inset_frac
    w = max(2, int(S * width_frac))
    if shape == "square":
        d.rounded_rectangle([i, i, S - i, S - i], S * 0.17, outline=GOLD + (255,), width=w)
    else:
        d.ellipse([i, i, S - i, S - i], outline=GOLD + (255,), width=w)
    big = big.resize(img.size, Image.LANCZOS)
    img.alpha_composite(big)


def square_icon(n, shape):
    img = felt(n, n)
    ring(img, 0.045, 0.012, "square" if shape == "square" else "round")
    img.alpha_composite(tile(n, n * 0.66))
    return img


def mask(img, shape):
    n = img.width
    S = n * 4
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    if shape == "round":
        d.ellipse([0, 0, S - 1, S - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], S * 0.18, fill=255)
    m = m.resize((n, n), Image.LANCZOS)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


master = square_icon(1024, "square")
save(master.convert("RGBA"), os.path.join(CLIENT, "resources", "icon.png"))

dens = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
for name, (leg, fg) in dens.items():
    d = os.path.join(RES, f"mipmap-{name}")
    big_sq = square_icon(leg * 4, "square").resize((leg, leg), Image.LANCZOS)
    big_rd = square_icon(leg * 4, "round").resize((leg, leg), Image.LANCZOS)
    save(mask(big_sq, "square"), os.path.join(d, "ic_launcher.png"))
    save(mask(big_rd, "round"), os.path.join(d, "ic_launcher_round.png"))
    # adaptive foreground: tile inside the 66/108 safe zone (rotated bbox stays inside)
    save(tile(fg * 2, fg * 2 * 0.47).resize((fg, fg), Image.LANCZOS), os.path.join(d, "ic_launcher_foreground.png"))

with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E5C3A</color>\n</resources>\n')

for n, nm in [(192, "icon-192.png"), (512, "icon-512.png"), (48, "favicon.png")]:
    save(master.resize((n, n), Image.LANCZOS), os.path.join(PUB, nm))

# splash: green felt with centred tile, same sizes as existing files
for root, _, files in os.walk(RES):
    for fn in files:
        if fn == "splash.png":
            p = os.path.join(root, fn)
            w, h = Image.open(p).size
            img = felt(w, h)
            t = tile(min(w, h), min(w, h) * 0.5)
            img.alpha_composite(t, ((w - t.width) // 2, (h - t.height) // 2))
            img.convert("RGB").save(p)
print("done")
