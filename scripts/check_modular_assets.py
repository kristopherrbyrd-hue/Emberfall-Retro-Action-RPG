"""Validate all eight character atlases without optional game/tool dependencies."""
from pathlib import Path
from PIL import Image, ImageChops
root=Path(__file__).resolve().parents[1] / 'public' / 'modular-heroes'
for cls in ['warrior', 'rogue', 'adept', 'mage']:
    for sex in ['male', 'female']:
        image=Image.open(root / f'{cls}-{sex}.png').convert('RGBA')
        mask=Image.open(root / f'{cls}-{sex}-regions.png').convert('RGBA')
        assert image.size==mask.size==(896,512), f'bad dimensions: {cls} {sex}'
        for row in range(4):
            tiles=[image.crop((128*c,128*row,128*(c+1),128*(row+1))) for c in range(7)]
            assert all(tile.getbbox() for tile in tiles),f'empty frame: {cls} {sex} row {row}'
            if row in (1,2):
                assert any(ImageChops.difference(tiles[j],tiles[j+1]).getbbox() for j in range(1,6)), f'no walk change: {cls} {sex} row {row}'
        print('OK',cls,sex)
