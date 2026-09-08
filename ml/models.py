"""The five candidate segmentation models, behind one registry so the trainer treats them identically.

All five take a 1-channel SAR tile and output 5-class logits (sea, oil, look-alike, ship, land). Four use
ImageNet-pretrained encoders via segmentation_models_pytorch (transfer learning); the fifth is our own from-scratch
U-Net (ml/unet.py), the no-pretraining baseline. Selection and rationale: docs/DECISIONS.md (2026-09-08).

Training only. Serving uses the ONNX export of the winner (see export.py) via onnxruntime — torch/smp never ship.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from torch import nn

from . import CLASSES

N_CLASSES = len(CLASSES)
IN_CH = 1


@dataclass(frozen=True)
class ModelSpec:
    name: str          # filesystem- and JSON-safe id; also the sidecar "name" and the metrics.json row key
    display: str       # human label for the comparison table
    build: Callable[[], nn.Module]
    note: str          # why this candidate is in the bake-off (evidence in docs/research.md / DECISIONS.md)


def _custom_unet() -> nn.Module:
    from .unet import UNet

    return UNet(in_ch=IN_CH, n_classes=N_CLASSES)


def _smp(arch: str, encoder: str) -> Callable[[], nn.Module]:
    def build() -> nn.Module:
        import segmentation_models_pytorch as smp

        factory = getattr(smp, arch)
        # in_channels=1 with imagenet weights: smp adapts the first conv by summing the RGB kernels.
        return factory(encoder_name=encoder, encoder_weights="imagenet", in_channels=IN_CH, classes=N_CLASSES)

    return build


# Order is the training order; if time is short, the first two are the priority pair (DECISIONS.md).
REGISTRY: dict[str, ModelSpec] = {
    "unet_scratch": ModelSpec(
        "unet_scratch", "U-Net (from scratch)", _custom_unet,
        "Baseline with no transfer learning; isolates what the pretrained encoders buy.",
    ),
    "unet_resnet34": ModelSpec(
        "unet_resnet34", "U-Net + ResNet-34", _smp("Unet", "resnet34"),
        "Parity with SkyTruth Cerulean's production model (research.md 3.1).",
    ),
    "unetpp_resnet34": ModelSpec(
        "unetpp_resnet34", "U-Net++ + ResNet-34", _smp("UnetPlusPlus", "resnet34"),
        "Dense nested skips; better thin-slick and boundary recovery than plain U-Net.",
    ),
    "deeplabv3p_resnet50": ModelSpec(
        "deeplabv3p_resnet50", "DeepLabV3+ + ResNet-50", _smp("DeepLabV3Plus", "resnet50"),
        "Krestenitis 2019 / Zhang winning family; ASPP multi-scale context.",
    ),
    "fpn_effb3": ModelSpec(
        "fpn_effb3", "FPN + EfficientNet-B3", _smp("FPN", "efficientnet-b3"),
        "Best accuracy-per-MB; the candidate that fits the <400 MB CPU serving budget.",
    ),
}

ALL = list(REGISTRY)
PRIORITY_PAIR = ["unet_scratch", "unet_resnet34"]


def build(name: str) -> nn.Module:
    if name not in REGISTRY:
        raise KeyError(f"unknown model '{name}'. Known: {', '.join(ALL)}")
    return REGISTRY[name].build()


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
