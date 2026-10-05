"""Compose the supplied animated XP-bar artwork over a shared rank banner."""
import base64
import io
import json
import sys
import warnings

from PIL import Image, ImageDraw, ImageFont, ImageOps
from sprites import asset_path, thin_bar_frames, write_preview_sprites

Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

CARD_SIZE = (800, 534)


def member_identity(payload):
    member = payload.get("member")
    if not member:
        return None
    layer = Image.new("RGBA", CARD_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    left, right = (204, 744) if not payload.get("banner") else (108, 692)
    draw.rounded_rectangle((left, 350, right, 416), radius=14, fill=(12, 10, 10, 220), outline=(156, 83, 35, 210))
    font_path = asset_path("member-font.ttf", "activity-rank-font.ttf")
    name_font = ImageFont.truetype(str(font_path), 22)
    detail_font = ImageFont.truetype(str(font_path), 14)
    avatar_box = (left + 12, 359, left + 60, 407)
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
        draw.text((left + 36, 382), initial, font=name_font, anchor="mm", fill=(255, 234, 212, 255))
    name = str(member.get("name") or "Membru").replace("\n", " ").replace("\r", " ")[:200]
    text_x = left + 74
    while draw.textlength(name, font=name_font) > right - text_x - 18 and len(name) > 1:
        name = name[:-2] + "…"
    draw.text((text_x, 360), name, font=name_font, fill=(255, 239, 222, 255))
    draw.text((text_x, 389), f"Rang {max(1, int(member.get('level', 1)))} · XP de activitate",
              font=detail_font, fill=(227, 181, 140, 255))
    return layer


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

    sprites = thin_bar_frames(payload["style"], float(payload["percentage"]))
    # The default has its own large XP medallion; custom art stays centered.
    position = (184 if not payload.get("banner") else 120, 281)
    identity = member_identity(payload)
    frames = []
    durations = []
    for artwork, duration in sprites:
        canvas = base.copy()
        canvas.paste(artwork, position, artwork)
        if identity:
            canvas.paste(identity, (0, 0), identity)
        frames.append(canvas)
        durations.append(duration)

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
    if len(sys.argv) == 3 and sys.argv[1] == "--sprites-out":
        write_preview_sprites(sys.argv[2])
    else:
        sys.stdout.buffer.write(render(json.load(sys.stdin)))
