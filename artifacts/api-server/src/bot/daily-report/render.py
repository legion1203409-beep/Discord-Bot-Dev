"""Draw the daily report card: the day's numbers and the last 7 days.

Reads one JSON object on stdin and writes a PNG on stdout. The Node side
(bot/daily-report-chart.ts) strips emoji from every text first, so the
DejaVu font covers everything that reaches this script.

Discord shows embed images about 400 px wide, on phones too, so the card is
800 px wide and every text is at least 20 px: it stays readable at half size.
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 800, 780
PAD = 40
BG_TOP = (22, 24, 30)
BG_BOTTOM = (13, 14, 18)
INK = (246, 241, 234)
INK_2 = (190, 185, 178)
INK_3 = (150, 146, 140)
LINE = (255, 255, 255, 26)
TILE = (255, 255, 255, 12)
GOOD = (61, 220, 132)
BAD = (255, 120, 120)


def font_path():
    local = Path(__file__).parent / "report-font.ttf"
    if local.exists():
        return local
    return Path(__file__).resolve().parents[3] / "assets" / "activity-rank-font.ttf"


FONT = str(font_path())
_fonts = {}


def font(size):
    if size not in _fonts:
        _fonts[size] = ImageFont.truetype(FONT, size)
    return _fonts[size]


def hex_color(value, fallback=(124, 58, 237)):
    try:
        value = value.lstrip("#")
        return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))
    except (ValueError, AttributeError):
        return fallback


def mix(color, other, amount):
    return tuple(round(c * (1 - amount) + o * amount) for c, o in zip(color, other))


def fit(draw, text, size_font, width):
    """The text, cut with an ellipsis so it fits the width."""
    text = str(text)
    if draw.textlength(text, font=size_font) <= width:
        return text
    while text and draw.textlength(text + "…", font=size_font) > width:
        text = text[:-1]
    return text + "…"


def number(value):
    return f"{int(value):,}".replace(",", ".")


def background(accent):
    image = Image.new("RGB", (WIDTH, HEIGHT), BG_BOTTOM)
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        draw.line([(0, y), (WIDTH, y)], fill=mix(BG_TOP, BG_BOTTOM, y / HEIGHT))
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((-240, -300, 420, 220), fill=accent + (80,))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    image.paste(glow, (0, 0), glow)
    return image.convert("RGBA")


def header(draw, data, accent):
    draw.text((PAD, 30), "RAPORT ZILNIC", font=font(20), fill=accent)
    draw.text((PAD, 56), fit(draw, data.get("guild", ""), font(40), WIDTH - 2 * PAD), font=font(40), fill=INK, stroke_width=1, stroke_fill=INK)
    draw.text((PAD, 108), fit(draw, data.get("date", ""), font(24), WIDTH - 2 * PAD), font=font(24), fill=INK_2)


def delta_text(delta, invert=False):
    """The change since the day before; for leaves, fewer is the good direction."""
    if delta is None:
        return None, None
    up, down = (BAD, GOOD) if invert else (GOOD, BAD)
    if delta > 0:
        return f"▲ +{number(delta)} față de ieri", up
    if delta < 0:
        return f"▼ −{number(-delta)} față de ieri", down
    return "= la fel ca ieri", INK_3


def metric_tiles(draw, data):
    metrics = data.get("metrics", [])[:6]
    top, gap, columns, tile_h = 156, 14, 3, 132
    tile_w = (WIDTH - 2 * PAD - gap * (columns - 1)) // columns
    for index, metric in enumerate(metrics):
        column, row = index % columns, index // columns
        x = PAD + column * (tile_w + gap)
        y = top + row * (tile_h + gap)
        draw.rounded_rectangle((x, y, x + tile_w, y + tile_h), radius=18, fill=TILE, outline=LINE)
        draw.text((x + 16, y + 14), fit(draw, metric.get("label", ""), font(21), tile_w - 32), font=font(21), fill=INK_3)
        value = number(metric.get("value", 0))
        size = 46
        while size > 26 and draw.textlength(value, font=font(size)) > tile_w - 32:
            size -= 2
        draw.text((x + 16, y + 42 + (46 - size) // 2), fit(draw, value, font(size), tile_w - 32), font=font(size), fill=INK, stroke_width=1, stroke_fill=INK)
        text, color = delta_text(metric.get("delta"), bool(metric.get("invert")))
        if text:
            if draw.textlength(text, font=font(19)) > tile_w - 32:
                # Big numbers keep the change and drop the words.
                text = text.split(" față")[0].split(" ca ieri")[0]
            draw.text((x + 16, y + 100), fit(draw, text, font(19), tile_w - 32), font=font(19), fill=color)


def activity_chart(draw, data, accent):
    left, top, right, bottom = PAD, 460, WIDTH - PAD, 706
    draw.rounded_rectangle((left, top, right, bottom), radius=18, fill=TILE, outline=LINE)
    title = fit(draw, data.get("activityTitle", "Activitate"), font(22), 420)
    draw.text((left + 18, top + 16), title, font=font(22), fill=INK_2)
    average = data.get("average")
    if average:
        legend = f"media {number(round(average))}/zi"
        legend_font = font(20)
        legend_x = right - 18 - draw.textlength(legend, font=legend_font)
        draw.text((legend_x, top + 17), legend, font=legend_font, fill=INK_3)
        for offset in (0, 14):
            draw.line([(legend_x - 40 + offset, top + 30), (legend_x - 32 + offset, top + 30)], fill=INK_3, width=2)
    days = data.get("activity", [])[-7:]
    values = [day.get("value") for day in days if day.get("value") is not None]
    peak = max(values) if values else 0
    chart_top, chart_bottom = top + 86, bottom - 48
    height = chart_bottom - chart_top
    slot = (right - left - 36) / max(1, len(days))
    bar_w = min(56, slot * 0.6)
    labels = []
    for index, day in enumerate(days):
        center = left + 18 + slot * index + slot / 2
        current = bool(day.get("current"))
        label = day.get("label", "")
        label_font = font(20)
        draw.text((center - draw.textlength(label, font=label_font) / 2, chart_bottom + 12), label, font=label_font, fill=INK if current else INK_3)
        value = day.get("value")
        if value is None:
            draw.text((center - draw.textlength("—", font=font(20)) / 2, chart_bottom - 30), "—", font=font(20), fill=INK_3)
            continue
        bar_h = max(6, round(height * (value / peak))) if peak else 6
        draw.rounded_rectangle((center - bar_w / 2, chart_bottom - bar_h, center + bar_w / 2, chart_bottom), radius=9,
                               fill=accent if current else mix(accent, BG_BOTTOM, 0.55))
        text = number(value)
        value_font = font(20)
        text_x = center - draw.textlength(text, font=value_font) / 2
        text_y = chart_bottom - bar_h - 28
        draw.text((text_x, text_y), text, font=value_font, fill=INK if current else INK_2)
        labels.append((text_x - 6, text_y - 2, text_x + draw.textlength(text, font=value_font) + 6, text_y + 26))
    if average and peak:
        # The average as a dashed line, broken where it would cross a number.
        y = chart_bottom - height * (average / peak)
        x = left + 18
        while x < right - 18:
            end = min(x + 8, right - 18)
            if not any(x <= x1 and end >= x0 and y0 <= y <= y1 for x0, y0, x1, y1 in labels):
                draw.line([(x, y), (end, y)], fill=INK_3, width=2)
            x += 14


def footer(draw, data):
    summary = data.get("summary")
    if summary:
        draw.text((PAD, 726), fit(draw, summary, font(22), WIDTH - 2 * PAD), font=font(22), fill=INK_2)


def render(data):
    accent = hex_color(data.get("color"))
    image = background(accent)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    header(draw, data, accent)
    metric_tiles(draw, data)
    activity_chart(draw, data, accent)
    footer(draw, data)
    image.alpha_composite(layer)
    output = io.BytesIO()
    image.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


def main():
    data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    sys.stdout.buffer.write(render(data))


if __name__ == "__main__":
    main()
