"""Compact U-Net for 5-class SAR segmentation. Training only; serving uses the ONNX export (see export.py).

Channels 32-64-128-256, bottleneck 512, ~7.8 M parameters. Input 1x256x256, output 5x256x256 logits.
"""

from __future__ import annotations

import torch
from torch import nn


class ConvBlock(nn.Module):
    def __init__(self, cin: int, cout: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
            nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.net(x)


class UNet(nn.Module):
    def __init__(self, in_ch: int = 1, n_classes: int = 5, widths: tuple[int, ...] = (32, 64, 128, 256), bottleneck: int = 512):
        super().__init__()
        self.enc = nn.ModuleList()
        c = in_ch
        for w in widths:
            self.enc.append(ConvBlock(c, w))
            c = w
        self.pool = nn.MaxPool2d(2)
        self.mid = ConvBlock(c, bottleneck)
        self.up = nn.ModuleList()
        self.dec = nn.ModuleList()
        c = bottleneck
        for w in reversed(widths):
            self.up.append(nn.ConvTranspose2d(c, w, 2, stride=2))
            self.dec.append(ConvBlock(w * 2, w))
            c = w
        self.head = nn.Conv2d(c, n_classes, 1)

    def forward(self, x):
        skips = []
        for block in self.enc:
            x = block(x)
            skips.append(x)
            x = self.pool(x)
        x = self.mid(x)
        for up, dec, skip in zip(self.up, self.dec, reversed(skips), strict=True):
            x = up(x)
            x = dec(torch.cat([x, skip], dim=1))
        return self.head(x)


if __name__ == "__main__":
    m = UNet()
    n = sum(p.numel() for p in m.parameters())
    y = m(torch.zeros(1, 1, 256, 256))
    print(f"params={n / 1e6:.2f}M output={tuple(y.shape)}")
