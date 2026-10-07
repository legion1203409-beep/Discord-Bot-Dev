"""Artwork regressions; no Discord, network or database access."""
import base64
import io
from pathlib import Path
import unittest
from unittest.mock import patch

from PIL import Image, ImageChops, ImageSequence

from render import member_identity, render
from sprites import SPRITE_SIZE, STYLES, asset_path, thin_bar_frames


class ThinArtworkTests(unittest.TestCase):
    def test_supplied_animation_frames_skip_the_intermediate_gif_encode(self):
        with patch.object(Image.Image, "save") as save:
            for style in STYLES:
                with self.subTest(style=style):
                    frames = thin_bar_frames(style, 62)
                    self.assertGreater(len(frames), 1)
                    self.assertTrue(all(duration > 0 for _, duration in frames))
            save.assert_not_called()

    def test_every_style_at_zero_partial_and_full_progress(self):
        for style in STYLES:
            for percentage in (0, 62, 100):
                with self.subTest(style=style, percentage=percentage):
                    frames = thin_bar_frames(style, percentage)
                    first, last = frames[0][0], frames[-1][0]
                    label_box = (460, 0, 560, 21)
                    ink = first.getchannel("A").crop(label_box).point(
                        lambda value: 255 if value == 255 else 0
                    )
                    self.assertIsNotNone(ink.getbbox())
                    for sprite, duration in frames:
                        self.assertEqual(sprite.size, SPRITE_SIZE)
                        self.assertEqual(sprite.getpixel((0, 0))[3], 0)
                        self.assertGreater(duration, 0)
                        # Sparks may cross the space around the label at 100%;
                        # compare the opaque glyphs, not the entire animated area.
                        label_difference = ImageChops.difference(
                            sprite.convert("RGB").crop(label_box),
                            first.convert("RGB").crop(label_box),
                        )
                        self.assertIsNone(
                            ImageChops.multiply(label_difference, Image.merge("RGB", (ink, ink, ink))).getbbox(),
                            "The readable label must show the actual percentage, not animation time",
                        )
                    if percentage:
                        self.assertIsNotNone(ImageChops.difference(
                            first.convert("RGB").crop((0, 26, 560, 58)),
                            last.convert("RGB").crop((0, 26, 560, 58)),
                        ).getbbox())
                    else:
                        shaft = [last.getpixel((360, y))[3] for y in range(28, 57)]
                        self.assertGreaterEqual(sum(alpha >= 200 for alpha in shaft), 10)
                        self.assertLessEqual(sum(alpha >= 200 for alpha in shaft), 18)

    def test_default_medallion_is_restored_from_the_original_and_not_covered(self):
        default = Image.open(asset_path("default-banner.png", "activity-rank-default.png")).convert("RGB")
        original_path = Path(__file__).resolve().parents[5] / "attached_assets" / (
            "108b03b1-c101-11f1-9c8f-0fa27766f74c_(15)_1791234658850.png"
        )
        original = Image.open(original_path).convert("RGB").resize(default.size, Image.Resampling.LANCZOS)
        self.assertIsNone(ImageChops.difference(
            default.crop((175, 389, 221, 443)), original.crop((175, 389, 221, 443)),
        ).getbbox())
        identity = member_identity({"member": {"name": "Membru Ștefan", "level": 5}})
        self.assertIsNone(identity.getchannel("A").crop((108, 280, 200, 372)).getbbox())
        self.assertIsNotNone(identity.getchannel("A").crop((204, 350, 744, 416)).getbbox())

    def test_custom_banner_shows_through_outside_the_line_for_every_style(self):
        image = Image.new("RGB", (800, 534), (10, 70, 90))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        banner = base64.b64encode(buffer.getvalue()).decode("ascii")
        for style in STYLES:
            with self.subTest(style=style):
                card = Image.open(io.BytesIO(render({
                    "banner": banner, "style": style, "percentage": 62,
                })))
                self.assertEqual(card.size, (800, 534))
                self.assertGreater(card.n_frames, 1)
                self.assertEqual(card.info["loop"], 0)
                background = card.convert("RGB").getpixel((20, 20))
                # GIF's shared palette can round a channel by one value.
                self.assertLessEqual(max(abs(a - b) for a, b in zip(background, (10, 70, 90))), 2)
                for frame in ImageSequence.Iterator(card):
                    rgb = frame.convert("RGB")
                    for position in ((400, 281), (400, 346), (121, 282)):
                        self.assertEqual(rgb.getpixel(position), background)

    def test_preview_gifs_preserve_transparency_and_geometry(self):
        public = Path(__file__).resolve().parents[4] / "status" / "public" / "activity-bars"
        for style in STYLES:
            with self.subTest(style=style):
                with Image.open(public / f"{style}.gif") as preview:
                    self.assertEqual(preview.size, SPRITE_SIZE)
                    self.assertGreater(preview.n_frames, 1)
                    self.assertEqual(preview.info["loop"], 0)
                    for frame in ImageSequence.Iterator(preview):
                        self.assertEqual(frame.convert("RGBA").getpixel((0, 0))[3], 0)


if __name__ == "__main__":
    unittest.main()
