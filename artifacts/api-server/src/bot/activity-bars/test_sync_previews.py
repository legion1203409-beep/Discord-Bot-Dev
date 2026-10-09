"""Build synchronization regressions without Discord or database access."""
from contextlib import redirect_stdout
import io
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from sprites import STYLES
from sync_previews import PUBLIC, synchronize, validate_previews


class PreviewSynchronizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generated = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.generated.cleanup)
        cls.reference = Path(cls.generated.name)
        subprocess.run(
            [sys.executable, str(Path(__file__).with_name("render.py")),
             "--sprites-out", str(cls.reference)],
            check=True,
        )

    def stage_reference(self, arguments, **kwargs):
        self.assertTrue(kwargs["check"])
        self.assertEqual(arguments[-2], "--sprites-out")
        for style in STYLES:
            shutil.copyfile(self.reference / f"{style}.gif", Path(arguments[-1]) / f"{style}.gif")

    def test_committed_previews_match_current_renderer_at_62_percent(self):
        validate_previews(self.reference)
        for style in STYLES:
            with self.subTest(style=style):
                self.assertEqual(
                    (PUBLIC / f"{style}.gif").read_bytes(),
                    (self.reference / f"{style}.gif").read_bytes(),
                )

    def test_generate_repairs_missing_and_stale_files_and_check_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with patch("sync_previews.subprocess.run", side_effect=self.stage_reference), redirect_stdout(io.StringIO()):
                synchronize(output)
                synchronize(output, check=True)
                (output / "discord.gif").write_bytes(b"stale")
                (output / "pro.gif").unlink()
                (output / "unexpected.gif").write_bytes(b"extra")
                with self.assertRaisesRegex(ValueError, "discord.gif.*pro.gif.*unexpected.gif"):
                    synchronize(output, check=True)
                self.assertEqual((output / "discord.gif").read_bytes(), b"stale")
                self.assertFalse((output / "pro.gif").exists())
                (output / "unexpected.gif").unlink()
                synchronize(output)
                synchronize(output, check=True)

    def test_renderer_failure_leaves_existing_previews_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "discord.gif"
            target.write_bytes(b"existing")
            with patch("sync_previews.subprocess.run", side_effect=subprocess.CalledProcessError(1, "render.py")):
                with self.assertRaises(subprocess.CalledProcessError):
                    synchronize(directory)
            self.assertEqual(target.read_bytes(), b"existing")
            self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_rejects_missing_opaque_or_wrong_size_previews(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with self.assertRaisesRegex(ValueError, "seven"):
                validate_previews(output)
            self.stage_reference(["--sprites-out", directory], check=True)
            for size in ((560, 64), (560, 63)):
                with self.subTest(size=size):
                    frames = [Image.new("RGB", size, color) for color in ("red", "blue")]
                    frames[0].save(
                        output / "discord.gif", save_all=True,
                        append_images=frames[1:], loop=0, duration=40,
                    )
                    with self.assertRaises(ValueError):
                        validate_previews(output)


if __name__ == "__main__":
    unittest.main()
