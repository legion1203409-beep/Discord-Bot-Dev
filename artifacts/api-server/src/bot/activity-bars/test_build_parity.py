"""Check the real API build's artwork without Discord or database access."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageSequence

from sprites import ARTWORK
from sync_previews import validate_previews


API = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
STYLES = ("discord", "dungi", "gradient", "oblic", "pixel", "pro", "sword")


class PackagedArtworkParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="activity-build-parity-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        # Exercise the actual packaging rules, not a test-only imitation of cp.
        # Building does not start the API, connect to Discord, or change XP.
        subprocess.run(["node", str(API / "build.mjs")], cwd=API, check=True, timeout=120)
        cls.packaged = API / "dist" / "activity-bars"
        cls.outputs = {}
        for name, renderer in (
            ("source", SOURCE / "render.py"),
            ("packaged", cls.packaged / "render.py"),
        ):
            output = cls.root / name
            subprocess.run(
                [sys.executable, str(renderer), "--sprites-out", str(output)],
                # No dependency on the API's working directory is allowed.
                cwd=cls.root, check=True, timeout=90,
            )
            cls.outputs[name] = output

    def test_build_copies_the_original_renderer_artwork_and_font(self):
        assets = {
            "render.py": SOURCE / "render.py",
            "sprites.py": SOURCE / "sprites.py",
            "default-banner.png": API / "assets" / "activity-rank-default.png",
            "member-font.ttf": API / "assets" / "activity-rank-font.ttf",
            "member-font-license.txt": API / "assets" / "activity-rank-font-license.txt",
            **{
                f"{name}.py": API.parents[1] / "attached_assets" / filename
                for name, filename in ARTWORK.items()
            },
        }
        for name, source in assets.items():
            with self.subTest(asset=name):
                self.assertEqual(
                    (self.packaged / name).read_bytes(), source.read_bytes(),
                    f"API build copied a different {name}",
                )

    def test_all_seven_packaged_gifs_match_sources_at_62_percent(self):
        for output in self.outputs.values():
            self.assertEqual(
                {path.name for path in output.glob("*.gif")},
                {f"{style}.gif" for style in STYLES},
            )
            validate_previews(output)
        for style in STYLES:
            with self.subTest(style=style):
                source = self.outputs["source"] / f"{style}.gif"
                packaged = self.outputs["packaged"] / f"{style}.gif"
                self.assertEqual(
                    packaged.read_bytes(), source.read_bytes(),
                    f"Packaged {style} GIF differs from the source renderer at 62%",
                )
                # Explicitly guard animation geometry, timing and transparency,
                # in addition to byte-for-byte artwork identity.
                with Image.open(source) as expected, Image.open(packaged) as actual:
                    self.assertEqual(actual.size, (560, 64))
                    self.assertEqual(actual.n_frames, expected.n_frames)
                    self.assertEqual(actual.info.get("loop"), 0)
                    for index, frame in enumerate(ImageSequence.Iterator(actual)):
                        expected.seek(index)
                        self.assertEqual(frame.size, (560, 64))
                        self.assertEqual(frame.info["duration"], expected.info["duration"])
                        rgba = frame.convert("RGBA")
                        self.assertEqual(rgba.getchannel("A").getextrema(), (0, 255))
                        self.assertEqual(rgba.getpixel((0, 0))[3], 0)
                        self.assertEqual(rgba.tobytes(), expected.convert("RGBA").tobytes())


if __name__ == "__main__":
    unittest.main()
