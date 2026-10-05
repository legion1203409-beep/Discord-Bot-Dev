"""
Bara de XP animata cu efecte (GIF): gradient, glow, dungi in miscare,
luciu, scantei la capat si flash la final. Doar Pillow.

    pip install pillow

Folosire in bot:
    buf = await asyncio.to_thread(bar_gif_pro, xp / needed)
    await interaction.followup.send(file=discord.File(buf, "xp.gif"))
"""
import io
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BG = (24, 26, 31)
TRACK = (48, 51, 58)
W, H = 640, 110
X0, X1, Y0, Y1 = 24, W - 24, 46, 76
RADIUS = 15
STOPS = [(0.0, (0, 220, 255)), (0.5, (150, 80, 255)), (1.0, (255, 70, 160))]


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _grad(t):
    t = max(0.0, min(1.0, t))
    for (p0, c0), (p1, c1) in zip(STOPS, STOPS[1:]):
        if t <= p1:
            return _lerp(c0, c1, (t - p0) / (p1 - p0))
    return STOPS[-1][1]


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        try:
            return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
        except OSError:
            return ImageFont.load_default()


def _ease(t):
    return 1 - (1 - t) ** 3


def bar_gif_pro(pct: float, text: bool = True, fill_frames: int = 36,
                idle_frames: int = 12, hold_ms: int = 2500) -> io.BytesIO:
    """pct = progres intre 0 si 1 (ex: xp / needed)."""
    pct = max(0.0, min(1.0, pct))
    rng = random.Random(7)
    particles = []
    font = _font(22)
    span = X1 - X0
    total = fill_frames + idle_frames
    frames = []

    for i in range(total + 1):
        t = min(i / fill_frames, 1.0)
        p = pct * _ease(t)
        fw = span * p
        idle = max(0, i - fill_frames)

        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((X0, Y0, X1, Y1), RADIUS, fill=TRACK)

        tip_x = X0 + fw
        if fw >= 4:
            r = min(RADIUS, fw / 2)
            mask = Image.new("L", (W, H), 0)
            ImageDraw.Draw(mask).rounded_rectangle((X0, Y0, tip_x, Y1), r, fill=255)

            # gradient dezvaluit pe masura ce bara creste
            grad = Image.new("RGB", (W, H), BG)
            gd = ImageDraw.Draw(grad)
            for x in range(int(fw)):
                gd.line([(X0 + x, Y0), (X0 + x, Y1)], fill=_grad(x / span))

            # glow (pulseaza usor in faza idle)
            pulse = 0.55 + 0.25 * (1 if idle % 6 < 3 else 0)
            glow_mask = mask.filter(ImageFilter.GaussianBlur(11)).point(
                lambda v: int(v * pulse))
            img.paste(grad.filter(ImageFilter.GaussianBlur(10)), (0, 0), glow_mask)
            img.paste(grad, (0, 0), mask)

            # dungi diagonale in miscare
            stripes = Image.new("L", (W, H), 0)
            sd = ImageDraw.Draw(stripes)
            off = (i * 5) % 30
            for k in range(-4, W // 30 + 6):
                sx = X0 + k * 30 + off
                sd.polygon([(sx, Y1), (sx + 12, Y1), (sx + 12 + 14, Y0), (sx + 14, Y0)],
                           fill=38)
            stripes = ImageChops.multiply(stripes, mask)
            img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0), stripes)

            # luciu care trece peste bara
            sweep_t = (t * 1.8 + idle * 0.07) % 1.0
            sx = X0 + fw * sweep_t
            band = Image.new("L", (W, H), 0)
            ImageDraw.Draw(band).rectangle((sx - 16, Y0, sx + 16, Y1), fill=130)
            band = ImageChops.multiply(band.filter(ImageFilter.GaussianBlur(7)), mask)
            img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0), band)

            # linie de lumina sus (aspect de sticla)
            hl = Image.new("L", (W, H), 0)
            ImageDraw.Draw(hl).rectangle((X0, Y0 + 3, tip_x, Y0 + 7), fill=70)
            img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0),
                      ImageChops.multiply(hl.filter(ImageFilter.GaussianBlur(2)), mask))

            # flash cand bara ajunge la capat
            if t >= 0.82 and idle < 5:
                f = int(110 * (1 - ((t - 0.82) / 0.18 if idle == 0 else 1)) *
                        (1 - idle / 5))
                if f > 0:
                    img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0),
                              mask.point(lambda v, f=f: min(v, f)))

        # scantei la capatul barii
        if i < fill_frames and p > 0.01:
            for _ in range(4):
                particles.append({
                    "x": tip_x, "y": rng.uniform(Y0 + 4, Y1 - 4),
                    "vx": rng.uniform(-1.5, 4), "vy": rng.uniform(-6, -1),
                    "life": 1.0, "s": rng.uniform(1.8, 4.2),
                    "c": _lerp(_grad(p), (255, 255, 255), 0.5)})
        sparks = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sp = ImageDraw.Draw(sparks)
        for q in particles:
            q["x"] += q["vx"] * 2
            q["y"] += q["vy"] * 2
            q["vy"] += 0.5
            q["life"] -= 0.13
            if q["life"] > 0:
                a = int(255 * q["life"])
                s = q["s"]
                sp.ellipse((q["x"] - s, q["y"] - s, q["x"] + s, q["y"] + s),
                           fill=q["c"] + (a,))
        particles = [q for q in particles if q["life"] > 0]
        glow = sparks.filter(ImageFilter.GaussianBlur(3))
        img.paste(glow, (0, 0), glow)
        img.paste(sparks, (0, 0), sparks)

        if text:
            ImageDraw.Draw(img).text((X1, Y0 - 10), f"{int(p * 100)}%", font=font,
                                     fill=(255, 255, 255), anchor="rs")
        frames.append(img)

    pal = [f.convert("P", palette=Image.ADAPTIVE) for f in frames]
    buf = io.BytesIO()
    pal[0].save(buf, format="GIF", save_all=True, append_images=pal[1:],
                duration=[40] * (len(pal) - 1) + [hold_ms], loop=0)
    buf.seek(0)
    return buf


if __name__ == "__main__":
    for name, v in (("45", 0.45), ("100", 1.0)):
        with open(f"bara_pro_{name}.gif", "wb") as f:
            f.write(bar_gif_pro(v).read())
        print("scris", f"bara_pro_{name}.gif")
