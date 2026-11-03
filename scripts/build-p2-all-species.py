#!/usr/bin/env python3
"""12종 2P 팔레트 시트 생성 — 포장 단계의 '색 교체'(런타임 tint 아님).

각 종의 1P 시트에서 실제로 쓰인 색만 뽑아 1:1로 다른 색으로 바꾼 새 시트를 만든다.
  - 픽셀 값 하나 → 새 픽셀 값 하나 (그라디언트·블렌드·모자이크 없음)
  - 어두운 윤곽선(V<0.22)은 그대로 둔다.
  - 색상환을 +150° 돌리고, 채도 상한 min(0.50, 1P×1.25+0.05), 명도 +0.05.
  - 알파는 손대지 않는다(모양·크기 동일 보장).
결과: dev-art/species/<folder>/sheet_p2.png + manifest.json의 p2Image.
"""
from __future__ import annotations

import colorsys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "dev-art" / "species"

SAT_CAP = 0.50
SAT_BOOST = 1.25
VALUE_BOOST = 0.05
HUE_SHIFT = 150 / 360
INK_VALUE = 0.22


def recolor(p1: tuple[int, int, int]) -> tuple[int, int, int]:
    r, g, b = (v / 255 for v in p1)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if v <= INK_VALUE:
        return p1  # 윤곽선은 그대로
    h2 = (h + HUE_SHIFT) % 1.0
    s2 = min(SAT_CAP, s * SAT_BOOST + 0.05)
    v2 = min(1.0, v + VALUE_BOOST)
    r2, g2, b2 = colorsys.hsv_to_rgb(h2, s2, v2)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def build(folder: Path) -> str | None:
    manifest_path = folder / "manifest.json"
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("p2Image"):
        return f"{folder.name}: 이미 있음({manifest['p2Image']})"
    sheet_path = folder / manifest["image"]
    from PIL import Image

    image = Image.open(sheet_path).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    mapping: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            key = (r, g, b)
            new = mapping.get(key)
            if new is None:
                new = recolor(key)
                mapping[key] = new
            if new != key:
                pixels[x, y] = (new[0], new[1], new[2], a)
    out_name = "sheet_p2.png"
    image.save(folder / out_name)
    manifest["p2Image"] = out_name
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
    return f"{folder.name}: {len(mapping)}색 → {out_name}"


def main() -> None:
    for folder in sorted(ROOT.iterdir()):
        if not folder.is_dir():
            continue
        result = build(folder)
        if result:
            print(result)


if __name__ == "__main__":
    main()
