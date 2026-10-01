#!/usr/bin/env python3
"""Resize official Domoween art for the web (proportional only, no other edits).

Usage:
  pip install pillow
  python3 tools/domoween-art.py SOURCE_PNG OUTPUT_NAME MAX_SIDE [MAX_SIDE ...]

Example:
  python3 tools/domoween-art.py ~/Downloads/halloween_witch-domo-broom.png wc_43_witch-broom 600
  python3 tools/domoween-art.py ~/Downloads/halloween_happy-halloween-domo-kun-banner.png \
      happy-halloween-domo-kun-banner 1600 800

The first MAX_SIDE writes assets/domoween/OUTPUT_NAME.{webp,png}; each extra size
writes OUTPUT_NAME-<size>.{webp,png}. WebP is lossless so flat vector colors and
edges stay identical to the original; transparency is preserved.
"""
import os
import sys

from PIL import Image

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'domoween')


def export(src, name, sizes):
    original = Image.open(src).convert('RGBA')
    for index, max_side in enumerate(sizes):
        scale = min(1.0, max_side / max(original.size))
        size = (round(original.width * scale), round(original.height * scale))
        # Resample in premultiplied alpha so transparent edges don't pick up dark fringes.
        img = original.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
        stem = name if index == 0 else '%s-%d' % (name, max_side)
        base = os.path.join(OUT_DIR, stem)
        img.save(base + '.webp', 'WEBP', lossless=True, method=6)
        img.save(base + '.png', 'PNG', optimize=True)
        print('%s.{webp,png} %dx%d' % (stem, size[0], size[1]))


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    export(sys.argv[1], sys.argv[2], [int(s) for s in sys.argv[3:]])
