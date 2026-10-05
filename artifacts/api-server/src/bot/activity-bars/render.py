"""Compose the supplied animated XP-bar artwork over a shared rank banner."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import warnings

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageSequence

Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

ARTWORK = {
    "normal": "xp_bar_normale_1791233452457.py",
    "pro": "xp_bar_pro_1791233452441.py",
    "sword": "xp_bar_sword_1791233452379.py",
}
NORMAL_STYLES = {"discord", "dungi", "gradient", "oblic", "pixel"}
CARD_SIZE = (800, 534)


def asset_path(local_name, source_name):
    local = Path(__file__).parent / local_name
    return local if local.exists() else Path(__file__).resolve().parents[3] / "assets" / source_name


def member_identity(payload):
    member = payload.get("member")
    if not member:
        return None
    layer = Image.new("RGBA", CARD_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle((108, 449, 692, 517), radius=14, fill=(12, 10, 10, 220), outline=(156, 83, 35, 210))
    font_path = asset_path("member-font.ttf", "activity-rank-font.ttf")
    name_font = ImageFont.truetype(str(font_path), 22)
    detail_font = ImageFont.truetype(str(font_path), 14)
    avatar_box = (120, 459, 168, 507)
    if member.get("avatar"):
        with Image.open(io.BytesIO(base64.b64decode(member["avatar"], validate=True))) as source:
            source.load()
            avatar = ImageOps.fit(source.convert("RGBA"), (48, 48), Image.Resampling.LANCZOS)
        mask = Image.new("L", (48, 48), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 47, 47), fill=255)
        layer.paste(avatar, avatar_box[:2], mask)
    else:
        draw.ellipse(avatar_box, fill=(73, 43, 29, 255), outline=(224, 135, 60, 255))
        initial = str(member.get("name", "M")).strip()[:1] or "M"
        draw.text((144, 482), initial, font=name_font, anchor="mm", fill=(255, 234, 212, 255))
    name = str(member.get("name") or "Membru").replace("\n", " ").replace("\r", " ")[:200]
    while draw.textlength(name, font=name_font) > 492 and len(name) > 1:
        name = name[:-2] + "…"
    draw.text((182, 460), name, font=name_font, fill=(255, 239, 222, 255))
    draw.text((182, 489), f"Rang {max(1, int(member.get('level', 1)))} · XP de activitate",
              font=detail_font, fill=(227, 181, 140, 255))
    return layer


def load_artwork(name):
    local = Path(__file__).parent / f"{name}.py"
    source = local if local.exists() else Path(__file__).resolve().parents[5] / "attached_assets" / ARTWORK[name]
    spec = importlib.util.spec_from_file_location(f"activity_bar_{name}", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_bar(style, percentage):
    pct = max(0.0, min(1.0, percentage / 100.0))
    options = {"fill_frames": 24, "idle_frames": 6, "hold_ms": 2500}
    if style in NORMAL_STYLES:
        return load_artwork("normal").bar_gif_normal(pct, style, **options)
    if style == "pro":
        return load_artwork("pro").bar_gif_pro(pct, **options)
    if style == "sword":
        return load_artwork("sword").bar_gif_sword(pct, **options)
    raise ValueError("Unknown activity XP bar style")


def render(payload):
    if payload.get("banner"):
        raw = base64.b64decode(payload["banner"], validate=True)
        if len(raw) > 10 * 1024 * 1024:
            raise ValueError("Rank banner exceeds the image size limit")
        with Image.open(io.BytesIO(raw)) as source:
            source.seek(0)
            source.load()
            base = ImageOps.fit(ImageOps.exif_transpose(source).convert("RGB"), CARD_SIZE, Image.Resampling.LANCZOS)
    else:
        with Image.open(asset_path("default-banner.png", "activity-rank-default.png")) as source:
            base = ImageOps.fit(source.convert("RGB"), CARD_SIZE, Image.Resampling.LANCZOS)

    animation = Image.open(make_bar(payload["style"], float(payload["percentage"])))
    target_width = 576
    target_height = round(animation.height * target_width / animation.width)
    position = ((800 - target_width) // 2, round(CARD_SIZE[1] * 0.58))
    identity = member_identity(payload)
    frames = []
    durations = []
    for frame in ImageSequence.Iterator(animation):
        canvas = base.copy()
        artwork = frame.convert("RGB").resize((target_width, target_height), Image.Resampling.LANCZOS)
        canvas.paste(artwork, position)
        if identity:
            canvas.paste(identity, (0, 0), identity)
        frames.append(canvas)
        durations.append(frame.info.get("duration", 40))

    # A shared palette keeps the banner unchanged between frames, allowing the
    # GIF encoder to store only the changing bar region instead of full images.
    palette = frames[-1].quantize(colors=256)
    frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    result = io.BytesIO()
    frames[0].save(
        result,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=1,
        optimize=True,
    )
    return result.getvalue()


if __name__ == "__main__":
    sys.stdout.buffer.write(render(json.load(sys.stdin)))
