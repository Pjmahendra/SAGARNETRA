"""Fit any photo to the sign-in backdrop without cropping the subject out of it.

    python scripts/fit_login_bg.py ~/Desktop/whatever.jpg

The page is wide; most photos are not. Cropping a 5:4 aerial to 16:9 throws away a third of the
frame, usually including the ship. So the whole photo is scaled to *fit*, and the leftover margin is
filled with a blurred, enlarged copy of the same photo — the margin reads as depth of field rather
than as letterbox bars, and nothing in the picture is lost.

Writes `web/public/media/login.jpg`. Darkening is not applied here: `SeaBackdrop.tsx` grades the
image in CSS so any replacement gets the same treatment.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/media/login.jpg"
TARGET = (2560, 1440)  # 16:9, the shape of a maximised browser window


def fit(src_path: Path, out_path: Path = OUT, target: tuple[int, int] = TARGET) -> None:
    src = Image.open(src_path).convert("RGB")
    tw, th = target
    sw, sh = src.size
    if min(sw, sh) < 700:
        print(f"warning: {sw}x{sh} is small for a full-page backdrop; it will look soft")

    # Backdrop: the same photo, scaled to cover, blurred hard and pushed down so it never competes
    # with the real frame sitting on top of it.
    cover = max(tw / sw, th / sh)
    bg = src.resize((max(1, round(sw * cover)), max(1, round(sh * cover))), Image.LANCZOS)
    bg = bg.crop((
        (bg.width - tw) // 2, (bg.height - th) // 2,
        (bg.width - tw) // 2 + tw, (bg.height - th) // 2 + th,
    ))
    bg = bg.filter(ImageFilter.GaussianBlur(48))
    bg = ImageEnhance.Brightness(bg).enhance(0.72)

    # The photo itself, whole, centred.
    contain = min(tw / sw, th / sh)
    fg = src.resize((max(1, round(sw * contain)), max(1, round(sh * contain))), Image.LANCZOS)
    bg.paste(fg, ((tw - fg.width) // 2, (th - fg.height) // 2))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg.save(out_path, "JPEG", quality=84, optimize=True, progressive=True)
    kb = out_path.stat().st_size / 1024
    print(f"{src_path.name} {sw}x{sh} -> {out_path.relative_to(ROOT)} {tw}x{th} ({kb:.0f} kB)")
    print(f"photo occupies {fg.width}x{fg.height}, the rest is its own blur")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    fit(Path(sys.argv[1]).expanduser())
