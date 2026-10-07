"""Transparent, thin derivatives of the user's original XP artwork."""
import importlib.util
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageSequence

ARTWORK = {
    "normal": "xp_bar_normale_1791233452457.py",
    "pro": "xp_bar_pro_1791233452441.py",
    "sword": "xp_bar_sword_1791233452379.py",
}
NORMAL_STYLES = {"discord", "dungi", "gradient", "oblic", "pixel"}
STYLES = sorted(NORMAL_STYLES | {"pro", "sword"})
SPRITE_SIZE = (560, 64)
TRACK_HEIGHT = 12
TRACK_CENTER = 40


def asset_path(local_name, source_name):
    local = Path(__file__).parent / local_name
    return local if local.exists() else Path(__file__).resolve().parents[3] / "assets" / source_name


def load_artwork(name):
    local = Path(__file__).parent / f"{name}.py"
    source = local if local.exists() else Path(__file__).resolve().parents[5] / "attached_assets" / ARTWORK[name]
    spec = importlib.util.spec_from_file_location(f"activity_bar_{name}", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def generated_animation_frames(generator):
    """Capture the supplied generator's GIF frames without encoding a temporary GIF."""
    original_save = Image.Image.save
    captured_frames = None
    captured_durations = None

    def capture_save(image, fp, format=None, **options):
        nonlocal captured_frames, captured_durations
        if (format or "").upper() == "GIF" and options.get("save_all"):
            captured_frames = [image, *options.get("append_images", [])]
            duration = options.get("duration", 40)
            if isinstance(duration, (int, float)):
                captured_durations = [int(duration)] * len(captured_frames)
            else:
                captured_durations = [int(value) for value in duration]
            captured_durations = (
                captured_durations + [40] * len(captured_frames)
            )[:len(captured_frames)]
            return None
        return original_save(image, fp, format=format, **options)

    # The renderer is a per-request Python process, so no other image work runs
    # concurrently while the supplied generator is building its frames.
    Image.Image.save = capture_save
    try:
        fallback = generator()
    finally:
        Image.Image.save = original_save

    if captured_frames is not None and captured_durations is not None:
        return list(zip(captured_frames, captured_durations))
    if fallback is None:
        raise RuntimeError("Activity bar generator did not produce GIF frames")

    # Preserve compatibility if a future artwork generator stops using
    # Pillow's multi-frame GIF save API.
    fallback.seek(0)
    with Image.open(fallback) as animation:
        return [
            (frame.copy(), int(frame.info.get("duration", 40)))
            for frame in ImageSequence.Iterator(animation)
        ]


def thin_bar_frames(style, percentage):
    percentage = max(0.0, min(100.0, percentage))
    pct = percentage / 100.0
    options = {"fill_frames": 24, "idle_frames": 6, "hold_ms": 2500}
    if style in NORMAL_STYLES:
        module = load_artwork("normal")
        # The readable percentage is added separately, not squeezed with the line.
        module._text = lambda *args, **kwargs: None
        generated = lambda: module.bar_gif_normal(pct, style, **options)
        background = module.BG
    elif style == "pro":
        module = load_artwork("pro")
        generated = lambda: module.bar_gif_pro(pct, text=False, **options)
        background = module.BG
    elif style == "sword":
        module = load_artwork("sword")
        background = (24, 26, 31)
        # Remove only the parchment layer. The original hilt, blade, dark bevel,
        # runes, sparks and forge animation are still drawn by the supplied code.
        module._parchment = lambda: Image.new("RGB", (module.W, module.H), background)
        module.STATIC = module._build_static()
        generated = lambda: module.bar_gif_sword(pct, text=False, **options)
    else:
        raise ValueError("Unknown activity XP bar style")

    font = ImageFont.truetype(str(asset_path("member-font.ttf", "activity-rank-font.ttf")), 20)
    vertical_scale = TRACK_HEIGHT / (module.Y1 - module.Y0 + 1)
    height = round(module.H * vertical_scale)
    offset_y = round(TRACK_CENTER - (module.Y0 + module.Y1) / 2 * vertical_scale)
    sprites = []
    for frame, duration in generated_animation_frames(generated):
        rgb = frame.convert("RGB")
        difference = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background))
        red, green, blue = difference.split()
        # Exact matte removal matters: Oblic's unfilled blocks are intentionally
        # close to BG. A tolerance or global black key would erase real artwork.
        alpha = ImageChops.lighter(ImageChops.lighter(red, green), blue).point(
            lambda value: 255 if value else 0
        )
        if style == "pixel":
            # Pixel writes its label directly, unlike the other normal styles.
            ImageDraw.Draw(alpha).rectangle((0, 0, module.W, module.Y0 - 5), fill=0)
        rgba = rgb.convert("RGBA")
        rgba.putalpha(alpha)
        rgba = rgba.resize((SPRITE_SIZE[0], height), Image.Resampling.LANCZOS)
        sprite = Image.new("RGBA", SPRITE_SIZE, (0, 0, 0, 0))
        sprite.paste(rgba, (0, offset_y))
        ImageDraw.Draw(sprite).text(
            (SPRITE_SIZE[0] - 2, 20), f"{int(percentage)}%", font=font,
            anchor="rs", fill=(255, 239, 222, 255),
        )
        sprites.append((sprite, duration))
    return sprites


def write_preview_sprites(output_dir):
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    for style in STYLES:
        sprites = thin_bar_frames(style, 62)
        frames, durations = [], []
        for sprite, duration in sprites:
            frame = sprite.copy()
            # GIF supports binary transparency. Pillow reserves the transparent
            # palette entry, so opaque black details do not become transparent.
            frame.putalpha(frame.getchannel("A").point(lambda value: 255 if value >= 128 else 0))
            frames.append(frame)
            durations.append(duration)
        frames[0].save(
            output / f"{style}.gif", format="GIF", save_all=True,
            append_images=frames[1:], duration=durations, loop=0, disposal=2,
        )
