"""Stitch Esri World Imagery tiles into one still for the sign-in backdrop.

Same tile service the console's map already uses, so the login page and the incident maps show the
same ground truth. Bundled as a file rather than fetched at runtime: the demo has to work offline.
"""
import io
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
Z = 13
# Chennai / Ennore coast — the sector in the reference, framed so the shoreline runs down the left
# third and open water fills the rest, which is where the sign-in panel sits.
WEST, SOUTH, EAST, NORTH = 80.12, 12.94, 80.62, 13.34
OUT = sys.argv[1] if len(sys.argv) > 1 else "web/public/media/login.jpg"
TARGET_W = 2400


def deg2px(lon, lat, z):
    n = 2 ** z * 256
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def fetch(args):
    z, x, y = args
    req = urllib.request.Request(URL.format(z=z, x=x, y=y), headers={"User-Agent": "SAGARNETRA/dev"})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return (x, y, Image.open(io.BytesIO(r.read())).convert("RGB"))
        except Exception:
            pass
    return (x, y, None)


x0, y0 = deg2px(WEST, NORTH, Z)
x1, y1 = deg2px(EAST, SOUTH, Z)
tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
jobs = [(Z, x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
print(f"{len(jobs)} tiles at z{Z}")

canvas = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
ok = 0
with ThreadPoolExecutor(max_workers=8) as pool:
    for x, y, im in pool.map(fetch, jobs):
        if im is None:
            continue
        ok += 1
        canvas.paste(im, ((x - tx0) * 256, (y - ty0) * 256))
print(f"fetched {ok}/{len(jobs)}")
if ok < len(jobs):
    raise SystemExit("some tiles failed; not writing a holed image")

crop = canvas.crop((int(x0 - tx0 * 256), int(y0 - ty0 * 256), int(x1 - tx0 * 256), int(y1 - ty0 * 256)))
w, h = crop.size
crop = crop.resize((TARGET_W, round(h * TARGET_W / w)), Image.LANCZOS)
crop.save(OUT, "JPEG", quality=80, optimize=True, progressive=True)
print(f"wrote {OUT} {crop.size[0]}x{crop.size[1]}")

