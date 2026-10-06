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


def effective_layout(payload):
    layout = payload.get("layout")
    if layout is not None:
        return layout
    if payload.get("banner"):
        return {
            "bar": {"x": 15, "y": 52.62, "width": 70},
            "member": {"x": 13.5, "y": 65.54, "width": 73},
        }
    return {
        "bar": {"x": 23, "y": 52.62, "width": 70},
        "member": {"x": 25.5, "y": 65.54, "width": 67.5},
    }


def member_identity(payload, layout=None):
    member = payload.get("member")
    if not member:
        return None
    if layout is None:
        layout = effective_layout(payload)
    layer = Image.new("RGBA", CARD_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    has_banner = bool(payload.get("banner"))
    base_left, base_right = (108, 692) if has_banner else (204, 744)
    base_width = base_right - base_left
    geometry = layout["member"]
    left = round(CARD_SIZE[0] * geometry["x"] / 100)
    top = round(CARD_SIZE[1] * geometry["y"] / 100)
    width = round(CARD_SIZE[0] * geometry["width"] / 100)
    scale = width / base_width
    height = round(82 * scale)
    draw.rounded_rectangle(
        (left, top, left + width, top + height),
        radius=max(1, round(14 * scale)),
        fill=(12, 10, 10, 230),
        outline=(156, 83, 35, 210),
        width=max(1, round(scale)),
    )
    font_path = asset_path("member-font.ttf", "activity-rank-font.ttf")
    name_font = ImageFont.truetype(str(font_path), max(1, round(30 * scale)))
    detail_font = ImageFont.truetype(str(font_path), max(1, round(20 * scale)))
    avatar_size = max(1, round(56 * scale))
    avatar_x = left + round(12 * scale)
    avatar_y = top + round(13 * scale)
    avatar_box = (avatar_x, avatar_y, avatar_x + avatar_size, avatar_y + avatar_size)
    if member.get("avatar"):
        with Image.open(io.BytesIO(base64.b64decode(member["avatar"], validate=True))) as source:
            source.load()
            avatar = ImageOps.fit(source.convert("RGBA"), (avatar_size, avatar_size), Image.Resampling.LANCZOS)
        mask = Image.new("L", (avatar_size, avatar_size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, avatar_size - 1, avatar_size - 1), fill=255)
        layer.paste(avatar, avatar_box[:2], mask)
    else:
        draw.ellipse((avatar_x, avatar_y, avatar_x + avatar_size - 1, avatar_y + avatar_size - 1),
                     fill=(73, 43, 29, 255), outline=(224, 135, 60, 255), width=max(1, round(scale)))
        initial = str(member.get("name", "M")).strip()[:1] or "M"
        draw.text((avatar_x + avatar_size / 2, avatar_y + avatar_size / 2), initial,
                  font=name_font, anchor="mm", fill=(255, 234, 212, 255))
    name = str(member.get("name") or "Membru").replace("\n", " ").replace("\r", " ")[:200]
    text_x = left + round(82 * scale)
    text_right = left + width - round(18 * scale)
    while draw.textlength(name, font=name_font) > text_right - text_x and len(name) > 1:
        name = name[:-2] + "…"
    draw.text((text_x, top + round(10 * scale)), name, font=name_font, fill=(255, 239, 222, 255))
    draw.text((text_x, top + round(51 * scale)), f"Rang {max(1, int(member.get('level', 1)))} · XP de activitate",
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

    layout = effective_layout(payload)
    sprites = thin_bar_frames(payload["style"], float(payload["percentage"]))
    bar_geometry = layout["bar"]
    bar_x = round(CARD_SIZE[0] * bar_geometry["x"] / 100)
    bar_y = round(CARD_SIZE[1] * bar_geometry["y"] / 100)
    bar_width = round(CARD_SIZE[0] * bar_geometry["width"] / 100)
    identity = member_identity(payload, layout)
    frames = []
    durations = []
    for artwork, duration in sprites:
        bar_height = max(1, round(artwork.height * bar_width / artwork.width))
        resized_bar = artwork.resize((bar_width, bar_height), Image.Resampling.LANCZOS)
        canvas = base.copy()
        canvas.paste(resized_bar, (bar_x, bar_y), resized_bar)
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
