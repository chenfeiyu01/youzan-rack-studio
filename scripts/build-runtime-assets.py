"""Prepare the mascot at its existing 2048px runtime size, losslessly encoded."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1] / 'public' / 'brand'
with Image.open(root / 'youzan-mascot.png') as image:
    size = (2048, round(2048 * image.height / image.width))
    image.resize(size, Image.Resampling.LANCZOS).save(root / 'youzan-mascot-2k.webp', lossless=True, method=6)
