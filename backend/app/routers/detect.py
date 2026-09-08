"""Stage 2: run segmentation on a tile, persist the detection, let the officer verify it."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from ml import ML_ROOT, SAMPLES_DIR
from ml.infer import Detector, load_metrics
from ml.preprocess import load_tile
from pydantic import BaseModel, Field

from ..db import new_id, out
from ..deps import Db, Officer
from ..services import audit, sectors
from ..services.sectors import zone_filter

router = APIRouter(prefix="/api/detect", tags=["detect"])
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# The five bake-off candidates (mirrors ml/models.py). Shown on the console so the officer sees the whole lineup;
# real per-model IoU/mIoU replace these rows once training writes ml/metrics.json (see docs/DECISIONS.md 2026-09-08).
CANDIDATE_MODELS = [
    {"name": "unet_scratch", "display": "U-Net (from scratch)", "status": "pending"},
    {"name": "unet_resnet34", "display": "U-Net + ResNet-34", "status": "pending"},
    {"name": "unetpp_resnet34", "display": "U-Net++ + ResNet-34", "status": "pending"},
    {"name": "deeplabv3p_resnet50", "display": "DeepLabV3+ + ResNet-50", "status": "pending"},
    {"name": "fpn_effb3", "display": "FPN + EfficientNet-B3", "status": "pending"},
]


def get_detector(request: Request) -> Detector:
    det = getattr(request.app.state, "detector", None)
    if det is None:
        det = Detector()
        request.app.state.detector = det
    return det


class VerifyIn(BaseModel):
    decision: Literal["confirmed", "lookalike", "uncertain"]
    reason: Literal["wind_shadow", "algal_bloom", "rain_cell", "low_wind", "other"] | None = None
    note: str = Field(default="", max_length=1000)


@router.get("/samples")
async def samples(user: Officer, db: Db):
    # Scoped like everything else: an officer reviews the scenes for their own sectors. A tile
    # outside every sector has no zone_id and is admin-only, the same rule vessels follow.
    docs = await db.samples.find(zone_filter(user)).sort("acquired_at", -1).to_list(50)
    result = []
    for d in docs:
        o = out(d)
        o["image_url"] = f"/api/detect/samples/{d['_id']}/image"
        o["available"] = (SAMPLES_DIR / f"{d['_id']}.png").exists()
        result.append(o)
    return result


@router.get("/samples/{sample_id}/image")
async def sample_image(sample_id: str):
    if "/" in sample_id or ".." in sample_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad sample id")
    p = SAMPLES_DIR / f"{sample_id}.png"
    if not p.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample image not bundled")
    return FileResponse(p, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/model")
async def model_info(_: Officer, request: Request):
    det = get_detector(request)
    # Show the full 5-model lineup, with trained rows (from metrics.json) overriding their "pending" placeholders.
    trained = {m["name"]: m for m in load_metrics()}
    merged = [trained.get(c["name"], c) for c in CANDIDATE_MODELS]
    merged += [m for n, m in trained.items() if n not in {c["name"] for c in CANDIDATE_MODELS}]
    # Published results from the literature, shown beside ours for context (reference, not run by us).
    benchmarks: list = []
    bpath = ML_ROOT / "benchmarks.json"
    if bpath.exists():
        try:
            benchmarks = json.loads(bpath.read_text()).get("models", [])
        except Exception:
            benchmarks = []
    return {
        "engine": det.engine,
        "model_name": det.model.name if det.model else None,
        "metrics": merged,
        "benchmarks": benchmarks,
    }


@router.post("")
async def detect(
    request: Request,
    user: Officer,
    db: Db,
    file: Annotated[UploadFile | None, File()] = None,
    sample_id: Annotated[str | None, Form()] = None,
    bbox: Annotated[
        str | None, Form(description="JSON [west, south, east, north] for tiles without a GeoTIFF georeference")
    ] = None,
):
    if file is None and not sample_id:
        # also accept a JSON body {"sample_id": ...} for convenience
        try:
            body = await request.json()
            sample_id = body.get("sample_id")
            bbox = json.dumps(body["bbox"]) if body.get("bbox") else None
        except Exception:
            pass
    if file is None and not sample_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Send a tile as multipart 'file' or a 'sample_id'")

    parsed_bbox: tuple[float, float, float, float] | None = None
    if bbox:
        try:
            vals = json.loads(bbox)
            parsed_bbox = tuple(float(v) for v in vals)  # type: ignore[assignment]
            if len(parsed_bbox) != 4:
                raise ValueError
        except (ValueError, TypeError) as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "bbox must be [west, south, east, north]") from e

    source: dict = {}
    if sample_id:
        sample = await db.samples.find_one({"_id": sample_id})
        if sample is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found")
        p = SAMPLES_DIR / f"{sample_id}.png"
        if not p.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample image is not bundled on this server")
        data = p.read_bytes()
        filename = p.name
        parsed_bbox = parsed_bbox or tuple(sample["bbox"])
        source = {
            "kind": "sample",
            "sample_id": sample_id,
            "scene": sample.get("scene"),
            "acquired_at": sample.get("acquired_at"),
        }
    else:
        assert file is not None
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Tile larger than 25 MB")
        filename = file.filename or "upload"
        source = {"kind": "upload", "filename": filename}

    try:
        tile = load_tile(data, filename)
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not read image: {e}") from e
    if tile.transform is None and parsed_bbox is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Tile has no georeference. Upload a GeoTIFF or provide a bbox."
        )

    det = get_detector(request)
    result = det.detect(tile, parsed_bbox)

    # File the detection under the sector it falls in, so it shows up in that sector's review queue.
    pt = result.centroid or (
        [(parsed_bbox[0] + parsed_bbox[2]) / 2, (parsed_bbox[1] + parsed_bbox[3]) / 2] if parsed_bbox else None
    )
    _, zone_id = await sectors.zone_for_point(db, pt[0], pt[1]) if pt else (None, None)

    doc = {
        "_id": new_id("det"),
        "created_at": datetime.now(UTC),
        "created_by": user["_id"],
        "zone_id": zone_id,
        "source": source,
        "engine": result.engine,
        "model_name": result.model_name,
        "confidence": result.confidence,
        "area_km2": result.area_km2,
        "centroid": list(result.centroid) if result.centroid else None,
        "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in result.polygon]]}
        if len(result.polygon) >= 4
        else None,
        "heading_deg": result.heading_deg,
        "elongation": result.elongation,
        "class_pixels": result.class_pixels,
        "inference_ms": result.inference_ms,
        "tile_shape": list(tile.shape),
        "bbox": list(parsed_bbox) if parsed_bbox else None,
        "tile_sha256": hashlib.sha256(data).hexdigest(),
        "mask_sha256": hashlib.sha256(result.mask_png.encode()).hexdigest(),
        "verification": None,
    }
    await db.detections.insert_one(doc)
    await audit.log(db, user["email"], "detect.run", doc["_id"])
    return {
        "detection_id": doc["_id"],
        "engine": result.engine,
        "model_name": result.model_name,
        "confidence": result.confidence,
        "area_km2": result.area_km2,
        "centroid": result.centroid,
        "polygon": result.polygon,
        "polygon_px": result.polygon_px,
        "heading_deg": result.heading_deg,
        "elongation": result.elongation,
        "class_pixels": result.class_pixels,
        "inference_ms": result.inference_ms,
        "mask_png": result.mask_png,
        "tile_sha256": doc["tile_sha256"],
        "has_spill": len(result.polygon) >= 4,
    }


@router.post("/{detection_id}/verify")
async def verify(detection_id: str, body: VerifyIn, user: Officer, db: Db):
    if body.decision == "lookalike" and body.reason is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give a reason when dismissing as a look-alike")
    ver = {
        "decision": body.decision,
        "reason": body.reason,
        "note": body.note,
        "by": user["_id"],
        "at": datetime.now(UTC),
    }
    res = await db.detections.find_one_and_update(
        {"_id": detection_id}, {"$set": {"verification": ver}}, return_document=True
    )
    if res is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Detection not found")
    await audit.log(db, user["email"], f"detect.verify.{body.decision}", detection_id)
    o = out(res)
    o.pop("mask_png", None)
    return o
