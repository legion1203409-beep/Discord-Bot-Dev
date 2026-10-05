"""
Bara de XP "sabie" (GIF): sabie pe pergament, lama se incinge ca la forja pe
masura ce se umple, runele se aprind, scantei de la varf, licarire la final.
Doar Pillow.

    pip install pillow

Folosire in bot:
    buf = await asyncio.to_thread(bar_gif_sword, xp / needed)
    await interaction.followup.send(file=discord.File(buf, "xp.gif"))
"""
import io
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 640, 140
Y0, Y1 = 66, 96
MID = (Y0 + Y1) // 2
X0, X1, XT = 98, 572, 612
INK = (62, 36, 18)

RUNES = [
    [[(0.2, 0), (0.2, 1)], [(0.2, 0.3), (0.85, 0)], [(0.2, 0.6), (0.85, 0.3)]],
    [[(0.1, 0), (0.1, 1)], [(0.1, 0), (0.85, 0.3)], [(0.85, 0.3), (0.85, 1)]],
    [[(0.2, 0), (0.2, 1)], [(0.2, 0.25), (0.8, 0.5), (0.2, 0.75)]],
    [[(0.2, 0), (0.2, 1)], [(0.2, 0.1), (0.8, 0.4)], [(0.2, 0.45), (0.8, 0.75)]],
    [[(0.2, 0), (0.2, 1)], [(0.2, 0), (0.8, 0.25), (0.2, 0.5)], [(0.2, 0.5), (0.8, 1)]],
    [[(0.8, 0.1), (0.2, 0.5), (0.8, 0.9)]],
    [[(0.5, 0), (0.5, 1)], [(0.1, 0.15), (0.5, 0.5), (0.9, 0.15)]],
    [[(0.5, 0), (0.1, 0.5), (0.5, 1), (0.9, 0.5), (0.5, 0)]],
]
RUNE_X = list(range(X0 + 44, X1 - 6, 50))


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _font(size):
    for name in ("DejaVuSerif-Bold.ttf", "DejaVuSerif.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _ease(t):
    return 1 - (1 - t) ** 3


BLADE = [(X0, Y0), (X1, Y0), (XT, MID), (X1, Y1), (X0, Y1)]


def _parchment():
    rng = random.Random(2)
    base = Image.new("RGB", (W, H), (214, 190, 142))
    blot = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(blot)
    for _ in range(40):
        x, y, r = rng.randint(0, W), rng.randint(0, H), rng.randint(20, 70)
        bd.ellipse((x - r, y - r, x + r, y + r), fill=rng.randint(10, 40))
    blot = blot.filter(ImageFilter.GaussianBlur(20))
    base.paste(Image.new("RGB", (W, H), (160, 120, 70)), (0, 0), blot)
    d = ImageDraw.Draw(base)
    for _ in range(600):
        d.point((rng.randint(0, W), rng.randint(0, H)), fill=(172, 140, 92))
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.rectangle((0, 0, W, H), fill=190)
    vd.rectangle((16, 14, W - 16, H - 14), fill=0)
    vig = vig.filter(ImageFilter.GaussianBlur(18))
    base.paste(Image.new("RGB", (W, H), (46, 26, 12)), (0, 0), vig)
    d = ImageDraw.Draw(base)
    d.rectangle((26, 22, W - 26, H - 22), outline=(92, 60, 34), width=2)
    d.rectangle((31, 27, W - 31, H - 27), outline=(92, 60, 34), width=1)
    for cx, cy in ((26, 22), (W - 26, 22), (26, H - 22), (W - 26, H - 22)):
        d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=(214, 190, 142), outline=(92, 60, 34), width=2)
        d.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=(120, 30, 24))
    return base


def _blade_mask():
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(BLADE, fill=255)
    return m


BLADE_MASK = _blade_mask()


def _bevel():
    top = Image.new("L", (W, H), 0)
    ImageDraw.Draw(top).rectangle((X0, Y0, XT, MID - 1), fill=60)
    bot = Image.new("L", (W, H), 0)
    ImageDraw.Draw(bot).rectangle((X0, MID + 1, XT, Y1), fill=70)
    mid = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mid).line([(X0, MID), (XT - 4, MID)], fill=90, width=1)
    return (ImageChops.multiply(top, BLADE_MASK), ImageChops.multiply(bot, BLADE_MASK),
            ImageChops.multiply(mid, BLADE_MASK))


BEV_TOP, BEV_BOT, BEV_MID = _bevel()


def _build_static():
    img = _parchment()
    sh = BLADE_MASK.filter(ImageFilter.GaussianBlur(4))
    sh = ImageChops.offset(sh, 3, 6).point(lambda v: int(v * 0.5))
    img.paste(Image.new("RGB", (W, H), (50, 30, 14)), (0, 0), sh)
    img.paste(Image.new("RGB", (W, H), (78, 84, 94)), (0, 0), BLADE_MASK)
    img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0), BEV_TOP.point(lambda v: v // 2))
    img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), BEV_BOT)
    d = ImageDraw.Draw(img)
    # maner
    d.rectangle((50, MID - 10, 90, MID + 10), fill=(88, 52, 28), outline=(40, 22, 10))
    for gx in range(54, 90, 8):
        d.line((gx, MID - 10, gx + 6, MID + 10), fill=(52, 30, 14), width=2)
    # buton
    d.ellipse((24, MID - 14, 54, MID + 14), fill=(128, 98, 42), outline=(52, 38, 14), width=2)
    d.ellipse((32, MID - 6, 46, MID + 6), fill=(150, 28, 24), outline=(52, 38, 14))
    d.ellipse((29, MID - 10, 36, MID - 5), fill=(220, 190, 110))
    # garda
    d.rounded_rectangle((88, MID - 36, 100, MID + 36), 4, fill=(128, 98, 42), outline=(52, 38, 14), width=2)
    d.line((90, MID - 34, 90, MID + 34), fill=(220, 190, 110))
    for cy in (MID - 38, MID + 38):
        d.ellipse((86, cy - 7, 102, cy + 7), fill=(128, 98, 42), outline=(52, 38, 14), width=2)
        d.ellipse((90, cy - 3, 98, cy + 3), fill=(150, 28, 24))
    return img


STATIC = _build_static()


def _steel(dist, heat):
    base = (188, 198, 210)
    if dist >= 80 or heat <= 0:
        return base
    k = ((1 - dist / 80.0) ** 1.6) * heat
    if k < 0.55:
        return _lerp(base, (255, 140, 40), k / 0.55)
    return _lerp((255, 140, 40), (255, 240, 205), (k - 0.55) / 0.45)


def _draw_rune(d, g, cx, color, width=2, h=16, w=11):
    for stroke in g:
        pts = [(cx + (u - 0.5) * w, MID + (v - 0.5) * h) for u, v in stroke]
        d.line(pts, fill=color, width=width)


def bar_gif_sword(pct: float, text: bool = True, fill_frames: int = 36,
                  idle_frames: int = 14, hold_ms: int = 2500) -> io.BytesIO:
    """pct = progres intre 0 si 1 (ex: xp / needed)."""
    pct = max(0.0, min(1.0, pct))
    rng = random.Random(13)
    sparks = []
    font = _font(28)
    span = XT - X0
    total = fill_frames + idle_frames
    frames = []

    for i in range(total + 1):
        t = min(i / fill_frames, 1.0)
        p = pct * _ease(t)
        fw = span * p
        tip = X0 + fw
        idle = max(0, i - fill_frames)
        heat = 1.0 if pct < 0.999 else max(0.0, 1 - idle / 8.0)

        img = STATIC.copy()

        if fw >= 3:
            fm = Image.new("L", (W, H), 0)
            ImageDraw.Draw(fm).rectangle((X0, Y0, tip, Y1), fill=255)
            fmask = ImageChops.multiply(fm, BLADE_MASK)

            # lumina calda in jurul varfului
            flick = 0.55 + 0.35 * rng.random()
            gl = Image.new("L", (W, H), 0)
            ImageDraw.Draw(gl).ellipse((tip - 50, MID - 40, tip + 50, MID + 40),
                                       fill=int(170 * flick * heat))
            gl = gl.filter(ImageFilter.GaussianBlur(20))
            img.paste(Image.new("RGB", (W, H), (255, 150, 50)), (0, 0), gl)

            steel = Image.new("RGB", (W, H), (188, 198, 210))
            sd = ImageDraw.Draw(steel)
            for x in range(int(X0), int(tip) + 1):
                sd.line([(x, Y0), (x, Y1)], fill=_steel(tip - x, heat))
            img.paste(steel, (0, 0), fmask)
            img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0),
                      ImageChops.multiply(BEV_TOP, fm))
            img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0),
                      ImageChops.multiply(BEV_BOT, fm))

            if t >= 0.82 and idle < 5:
                f = int(120 * (1 - idle / 5) * (1 - ((t - 0.82) / 0.18 if idle == 0 else 1)))
                if f > 0:
                    img.paste(Image.new("RGB", (W, H), (255, 235, 170)), (0, 0),
                              fmask.point(lambda v, f=f: min(v, f)))

            # licarire care trece peste lama
            if idle > 0:
                gx = X0 + fw * (idle / float(idle_frames))
                band = Image.new("L", (W, H), 0)
                ImageDraw.Draw(band).polygon(
                    [(gx - 10, Y1), (gx + 4, Y1), (gx + 16, Y0), (gx + 2, Y0)], fill=190)
                band = ImageChops.multiply(band.filter(ImageFilter.GaussianBlur(3)), fmask)
                img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0), band)

        # rune
        d = ImageDraw.Draw(img)
        glow = Image.new("L", (W, H), 0)
        gd = ImageDraw.Draw(glow)
        for idx, rx in enumerate(RUNE_X):
            g = RUNES[idx % len(RUNES)]
            if rx < tip - 4:
                lit = max(0.0, 1 - (tip - rx) / 100.0)
                color = _lerp((150, 86, 30), (255, 214, 110), lit)
                _draw_rune(d, g, rx, color)
                if lit > 0.15:
                    _draw_rune(gd, g, rx, int(255 * lit), width=3)
            else:
                _draw_rune(d, g, rx, (50, 55, 63))
        glow = glow.filter(ImageFilter.GaussianBlur(3))
        img.paste(Image.new("RGB", (W, H), (255, 170, 60)), (0, 0), glow.point(lambda v: int(v * 0.8)))

        ImageDraw.Draw(img).polygon(BLADE, outline=(34, 38, 46))

        # scantei de la varf
        if fw >= 3 and (i < fill_frames or idle % 2 == 0):
            for _ in range(4 if i < fill_frames else 1):
                sparks.append({"x": tip, "y": rng.uniform(Y0 + 2, Y1 - 2),
                               "vx": rng.uniform(0.5, 5.0), "vy": rng.uniform(-5.5, -0.5),
                               "life": 1.0, "s": rng.uniform(1.3, 3.0),
                               "c": (255, rng.randint(140, 215), rng.randint(30, 80))})
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for q in sparks:
            q["x"] += q["vx"] * 1.8
            q["y"] += q["vy"] * 1.8
            q["vy"] += 0.55
            q["life"] -= 0.09
            if q["life"] > 0:
                a = int(255 * q["life"])
                s = q["s"] * (0.5 + q["life"] * 0.5)
                ld.ellipse((q["x"] - s, q["y"] - s, q["x"] + s, q["y"] + s), fill=q["c"] + (a,))
        sparks = [q for q in sparks if q["life"] > 0]
        gl2 = layer.filter(ImageFilter.GaussianBlur(2.5))
        img.paste(gl2, (0, 0), gl2)
        img.paste(layer, (0, 0), layer)

        if text:
            ImageDraw.Draw(img).text((X1 + 30, 52), f"{int(p * 100)}%", font=font,
                                     fill=INK, anchor="rs")
        frames.append(img)

    pal = [f.convert("P", palette=Image.ADAPTIVE) for f in frames]
    buf = io.BytesIO()
    pal[0].save(buf, format="GIF", save_all=True, append_images=pal[1:],
                duration=[45] * (len(pal) - 1) + [hold_ms], loop=0)
    buf.seek(0)
    return buf


if __name__ == "__main__":
    for name, v in (("45", 0.45), ("100", 1.0)):
        with open(f"bara_sabie_{name}.gif", "wb") as f:
            f.write(bar_gif_sword(v).read())
        print("scris", f"bara_sabie_{name}.gif")
