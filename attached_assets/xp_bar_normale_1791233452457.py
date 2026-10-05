"""
Bare de XP "normale" (GIF), 5 stiluri curate: discord, dungi, gradient, oblic, pixel.
Doar Pillow:  pip install pillow

Folosire in bot:
    buf = await asyncio.to_thread(bar_gif_normal, xp / needed, "discord")
    await interaction.followup.send(file=discord.File(buf, "xp.gif"))
"""
import io

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 600, 76
X0, X1, Y0, Y1 = 20, W - 20, 30, 54
BG = (49, 51, 56)
TRACK = (30, 31, 34)
WHITE = (255, 255, 255)


def _font(size):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            return ImageFont.load_default()


FONT = _font(18)


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _ease(t):
    return 1 - (1 - t) ** 3


def _rr(d, x0, y0, x1, y1, r, fill):
    if x1 - x0 < 2:
        return
    d.rounded_rectangle((x0, y0, x1, y1), min(r, (x1 - x0) / 2, (y1 - y0) / 2), fill=fill)


def _mask(fw, r=12):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((X0, Y0, X0 + fw, Y1), min(r, fw / 2, (Y1 - Y0) / 2), fill=255)
    return m


def _lay(img, color, layer, mask):
    img.paste(Image.new("RGB", (W, H), color), (0, 0), ImageChops.multiply(layer, mask))


def _text(img, p, color=WHITE):
    ImageDraw.Draw(img).text((X1, Y0 - 8), f"{int(p * 100)}%", font=FONT, fill=color, anchor="rs")


# ---------------------------------------------------------------
def _discord(img, p, i, t, idle):
    d = ImageDraw.Draw(img)
    _rr(d, X0, Y0, X1, Y1, 12, TRACK)
    fw = (X1 - X0) * p
    if fw >= 2:
        m = _mask(fw)
        img.paste(Image.new("RGB", (W, H), (88, 101, 242)), (0, 0), m)
        hl = Image.new("L", (W, H), 0)
        ImageDraw.Draw(hl).rectangle((X0, Y0, X1, Y0 + 8), fill=60)
        _lay(img, WHITE, hl, m)
        sx = X0 + fw * ((t * 1.3 + idle * 0.06) % 1.0)
        band = Image.new("L", (W, H), 0)
        ImageDraw.Draw(band).rectangle((sx - 14, Y0, sx + 14, Y1), fill=70)
        _lay(img, WHITE, band.filter(ImageFilter.GaussianBlur(6)), m)
    _text(img, p)


def _dungi(img, p, i, t, idle):
    d = ImageDraw.Draw(img)
    _rr(d, X0, Y0, X1, Y1, 12, TRACK)
    fw = (X1 - X0) * p
    if fw >= 2:
        m = _mask(fw)
        img.paste(Image.new("RGB", (W, H), (67, 181, 129)), (0, 0), m)
        st = Image.new("L", (W, H), 0)
        sd = ImageDraw.Draw(st)
        off = (i * 4) % 32
        for k in range(-3, (X1 - X0) // 32 + 4):
            sx = X0 + k * 32 + off
            sd.polygon([(sx, Y1), (sx + 14, Y1), (sx + 14 + 24, Y0), (sx + 24, Y0)], fill=60)
        _lay(img, WHITE, st, m)
    _text(img, p)


def _gradient(img, p, i, t, idle):
    d = ImageDraw.Draw(img)
    _rr(d, X0, Y0, X1, Y1, 12, TRACK)
    fw = (X1 - X0) * p
    c1, c2 = (255, 159, 67), (238, 82, 83)
    if fw >= 2:
        m = _mask(fw)
        g = Image.new("RGB", (W, H), TRACK)
        gd = ImageDraw.Draw(g)
        for x in range(int(fw)):
            gd.line([(X0 + x, Y0), (X0 + x, Y1)], fill=_lerp(c1, c2, x / (X1 - X0)))
        img.paste(g, (0, 0), m)
        cx = X0 + fw
        cy = (Y0 + Y1) // 2
        gl = Image.new("L", (W, H), 0)
        ImageDraw.Draw(gl).ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill=140)
        img.paste(Image.new("RGB", (W, H), _lerp(c1, c2, p)), (0, 0), gl.filter(ImageFilter.GaussianBlur(10)))
        d = ImageDraw.Draw(img)
        d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=WHITE, outline=_lerp(c1, c2, p), width=4)
    _text(img, p)


def _oblic(img, p, i, t, idle):
    d = ImageDraw.Draw(img)
    n, gap, s = 16, 5, 10
    sw = (X1 - X0 - s - gap * (n - 1)) / n
    v = p * n
    for b in range(n):
        x = X0 + b * (sw + gap)
        poly = [(x + s, Y0), (x + sw + s, Y0), (x + sw, Y1), (x, Y1)]
        if b + 1 <= v:
            col = _lerp((0, 200, 255), (130, 80, 255), b / (n - 1))
            if b == int(v) - 1 and p < 0.999 and t < 1:
                col = _lerp(col, WHITE, 0.45)
        elif b < v:
            col = _lerp((44, 46, 54), _lerp((0, 200, 255), (130, 80, 255), b / (n - 1)), v - b)
        else:
            col = (44, 46, 54)
        d.polygon(poly, fill=col)
    _text(img, p)


def _pixel(img, p, i, t, idle):
    d = ImageDraw.Draw(img)
    d.rectangle((X0 - 4, Y0 - 4, X1 + 4, Y1 + 4), fill=(0, 0, 0))
    d.rectangle((X0, Y0, X1, Y1), fill=(44, 44, 56))
    n = 30
    bw = (X1 - X0) / n
    v = p * n
    for b in range(n):
        if b + 0.5 <= v:
            x0, x1 = X0 + b * bw, X0 + (b + 1) * bw - 2
            d.rectangle((x0, Y0, x1, Y1), fill=(76, 200, 60))
            d.rectangle((x0, Y0, x1, Y0 + 5), fill=(150, 255, 120))
            d.rectangle((x0, Y1 - 5, x1, Y1), fill=(40, 130, 40))
    ImageDraw.Draw(img).text((X1 + 1, Y0 - 7), f"{int(p * 100)}%", font=FONT, fill=(0, 0, 0), anchor="rs")
    ImageDraw.Draw(img).text((X1, Y0 - 8), f"{int(p * 100)}%", font=FONT, fill=WHITE, anchor="rs")


STYLES = {"discord": _discord, "dungi": _dungi, "gradient": _gradient,
          "oblic": _oblic, "pixel": _pixel}


def bar_gif_normal(pct: float, style: str = "discord", fill_frames: int = 30,
                   idle_frames: int = 10, hold_ms: int = 2500) -> io.BytesIO:
    """pct = progres intre 0 si 1 (ex: xp / needed)."""
    pct = max(0.0, min(1.0, pct))
    fn = STYLES[style]
    frames = []
    for i in range(fill_frames + idle_frames + 1):
        t = min(i / fill_frames, 1.0)
        idle = max(0, i - fill_frames)
        img = Image.new("RGB", (W, H), BG)
        fn(img, pct * _ease(t), i, t, idle)
        frames.append(img.convert("P", palette=Image.ADAPTIVE))
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:],
                   duration=[40] * (len(frames) - 1) + [hold_ms], loop=0)
    buf.seek(0)
    return buf


if __name__ == "__main__":
    for s in STYLES:
        with open(f"bara_{s}.gif", "wb") as f:
            f.write(bar_gif_normal(0.62, s).read())
        print("scris", f"bara_{s}.gif")
