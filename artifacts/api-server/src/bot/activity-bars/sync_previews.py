"""Regenerate panel previews with the same renderer used by /rank."""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile

from PIL import Image, ImageSequence

from sprites import SPRITE_SIZE, STYLES

PUBLIC = Path(__file__).resolve().parents[4] / "status" / "public" / "activity-bars"


def validate_previews(directory):
    expected = {f"{style}.gif" for style in STYLES}
    if {path.name for path in directory.glob("*.gif")} != expected:
        raise ValueError("Expected exactly the seven activity bar previews")
    for name in sorted(expected):
        with Image.open(directory / name) as preview:
            if preview.size != SPRITE_SIZE or preview.n_frames < 2 or preview.info.get("loop") != 0:
                raise ValueError(f"{name}: expected an animated, looping 560x64 GIF")
            for frame in ImageSequence.Iterator(preview):
                if frame.convert("RGBA").getpixel((0, 0))[3] != 0:
                    raise ValueError(f"{name}: lost transparency")
                if frame.info.get("duration", 0) <= 0:
                    raise ValueError(f"{name}: invalid frame duration")


def synchronize(output=PUBLIC, check=False):
    output = Path(output)
    # Generate and validate the entire set before touching the published files.
    # Never fall back to stale previews when Python, artwork or fonts are missing.
    with tempfile.TemporaryDirectory(prefix="activity-bar-previews-") as temporary:
        staged = Path(temporary)
        subprocess.run(
            [sys.executable, str(Path(__file__).with_name("render.py")),
             "--sprites-out", str(staged)],
            check=True,
        )
        validate_previews(staged)
        if check:
            stale = [
                f"{style}.gif" for style in STYLES
                if not (output / f"{style}.gif").is_file()
                or (output / f"{style}.gif").read_bytes() != (staged / f"{style}.gif").read_bytes()
            ]
            extras = {path.name for path in output.glob("*.gif")} - {f"{style}.gif" for style in STYLES}
            if stale or extras:
                raise ValueError(
                    f"Activity bar previews are out of sync: {', '.join(sorted(set(stale) | extras))}. "
                    "Run pnpm --filter @workspace/status run previews:generate."
                )
        else:
            output.mkdir(parents=True, exist_ok=True)
            for style in STYLES:
                target = output / f"{style}.gif"
                content = (staged / target.name).read_bytes()
                if not target.is_file() or target.read_bytes() != content:
                    target.write_bytes(content)
    print("Activity bar previews synchronized: 7 transparent 560x64 GIFs at 62%.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail on stale previews without changing files")
    arguments = parser.parse_args()
    synchronize(check=arguments.check)
