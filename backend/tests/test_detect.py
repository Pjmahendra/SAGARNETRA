import base64
import io

import numpy as np
from PIL import Image

from tests.conftest import login


def synthetic_tile(with_spill: bool, seed: int = 7) -> bytes:
    """Speckled sea with an optional dark elongated patch, no georeference (PNG)."""
    rng = np.random.default_rng(seed)
    h, w = 320, 480
    img = rng.gamma(4.0, 30.0, (h, w)).clip(0, 255)
    if with_spill:
        yy, xx = np.mgrid[0:h, 0:w]
        cx, cy = w * 0.55, h * 0.5
        dx = (xx - cx) * np.cos(0.6) + (yy - cy) * np.sin(0.6)
        dy = -(xx - cx) * np.sin(0.6) + (yy - cy) * np.cos(0.6)
        inside = (dx / 110) ** 2 + (dy / 28) ** 2 < 1
        img[inside] *= 0.25
    buf = io.BytesIO()
    Image.fromarray(img.astype(np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


async def test_detect_requires_auth_and_input(client):
    assert (await client.post("/api/detect")).status_code == 401
    h = await login(client, "officer@test.in", "Officer@12345")
    r = await client.post("/api/detect", headers=h)
    assert r.status_code == 400


async def test_detect_upload_finds_spill_and_persists(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    files = {"file": ("tile.png", synthetic_tile(True), "image/png")}
    r = await client.post("/api/detect", headers=h, files=files, data={"bbox": "[69.30, 20.95, 69.55, 21.15]"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["engine"] in {"heuristic", "unet"}
    assert body["has_spill"] is True
    assert body["area_km2"] > 0
    assert len(body["polygon"]) >= 4 and body["polygon"][0] == body["polygon"][-1]
    lon, lat = body["centroid"]
    assert 69.30 <= lon <= 69.55 and 20.95 <= lat <= 21.15
    assert body["elongation"] > 2  # the synthetic patch is a streak
    assert body["class_pixels"]["oil"] > 0
    png = base64.b64decode(body["mask_png"])
    assert png[:8] == b"\x89PNG\r\n\x1a\n"

    det = await client.db.detections.find_one({"_id": body["detection_id"]})  # type: ignore[attr-defined]
    assert det is not None and det["geometry"]["type"] == "Polygon" and det["tile_sha256"]


async def test_detect_clean_tile_has_no_polygon(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    files = {"file": ("clean.png", synthetic_tile(False), "image/png")}
    r = await client.post("/api/detect", headers=h, files=files, data={"bbox": "[68.9, 22.4, 69.15, 22.6]"})
    assert r.status_code == 200, r.text
    assert r.json()["has_spill"] is False and r.json()["area_km2"] == 0


async def test_detect_without_georeference_is_rejected(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    r = await client.post("/api/detect", headers=h, files={"file": ("tile.png", synthetic_tile(True), "image/png")})
    assert r.status_code == 400


async def test_verify_detection(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    r = await client.post(
        "/api/detect",
        headers=h,
        files={"file": ("tile.png", synthetic_tile(True), "image/png")},
        data={"bbox": "[69.30, 20.95, 69.55, 21.15]"},
    )
    det_id = r.json()["detection_id"]
    bad = await client.post(f"/api/detect/{det_id}/verify", headers=h, json={"decision": "lookalike"})
    assert bad.status_code == 400
    ok = await client.post(
        f"/api/detect/{det_id}/verify",
        headers=h,
        json={"decision": "lookalike", "reason": "wind_shadow", "note": "lee of Diu"},
    )
    assert ok.status_code == 200 and ok.json()["verification"]["reason"] == "wind_shadow"
    assert (await client.post("/api/detect/nope/verify", headers=h, json={"decision": "confirmed"})).status_code == 404


async def test_model_info_and_samples(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    m = await client.get("/api/detect/model", headers=h)
    assert m.status_code == 200 and m.json()["engine"] in {"heuristic", "unet"}
    s = await client.get("/api/detect/samples", headers=h)
    assert s.status_code == 200
