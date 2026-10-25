"""Trace the supplied brand silhouettes into scalable paths, without redrawing the logo."""
from pathlib import Path
from PIL import Image
import numpy as np

root = Path(__file__).resolve().parents[1] / 'public' / 'brand'

def contours(field):
    field = np.pad(field, 1)
    links = {}
    def add(a, b):
        a, b = tuple(round(v - 1, 5) for v in a), tuple(round(v - 1, 5) for v in b)
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)
    for y in range(field.shape[0] - 1):
        for x in range(field.shape[1] - 1):
            points = [(x,y),(x+1,y),(x+1,y+1),(x,y+1)]
            values = [field[py,px] for px,py in points]
            if min(values) >= .5 or max(values) < .5:
                continue
            for ids in [(0,1,2),(0,2,3)]:
                intersections = []
                for a,b in [(ids[0],ids[1]),(ids[1],ids[2]),(ids[2],ids[0])]:
                    if (values[a] >= .5) == (values[b] >= .5):
                        continue
                    t = (.5-values[a])/(values[b]-values[a])
                    intersections.append(tuple(points[a][k]+t*(points[b][k]-points[a][k]) for k in [0,1]))
                if len(intersections) == 2:
                    add(*intersections)
    paths = []
    while links:
        start = next(iter(links))
        path, current = [start], start
        while current in links:
            other = links[current].pop()
            if not links[current]: del links[current]
            links[other].remove(current)
            if not links[other]: del links[other]
            if other == start: break
            path.append(other)
            current = other
        if len(path) > 8:
            paths.append('M'+'L'.join(f'{x:.3f},{y:.3f}' for x,y in path)+'Z')
    return ' '.join(paths)

for name in ['wordmark','round']:
    rgb = np.asarray(Image.open(root / f'youzan-{name}.png').convert('RGB'), dtype=float)
    if name == 'wordmark':
        red = np.clip((rgb[:,:,0]-np.maximum(rgb[:,:,1],rgb[:,:,2]))/230,0,1)
        black = 1-rgb.max(axis=2)/255
        yy,xx = np.where(np.maximum(red,black)>.5)
        box = [xx.min()-3,yy.min()-3,xx.max()-xx.min()+6,yy.max()-yy.min()+6]
        shapes = f'<path fill="#e60012" d="{contours(red)}"/><path fill="#000" d="{contours(black)}"/>'
    else:
        yy,xx = np.mgrid[:rgb.shape[0],:rgb.shape[1]]
        white = rgb.min(axis=2)/255 * (((xx-223.5)**2+(yy-223.5)**2)<160**2)
        box = [46,46,355,355]
        shapes = f'<circle cx="223.5" cy="223.5" r="173.5" fill="#e60012"/><path fill="#fff" d="{contours(white)}"/>'
    target = root / f'youzan-{name}.svg'
    target.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{box[2]}" height="{box[3]}" viewBox="{" ".join(str(v) for v in box)}" fill-rule="evenodd">{shapes}</svg>\n')
    print(target.name, target.stat().st_size)
