#!/usr/bin/env python3
"""Compose filled-bottle / gas-canister icons the way the game does:
   bottle base artwork + the content icon pasted into the bottle body."""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'assets')
CANVAS = 256

# bottle key -> (base item icon, canvas tint)
BOTTLE_BASE = {
    'iron': 'item_iron_bottle',
    'ironenr': 'item_iron_enr_bottle',
    'glass': 'item_glass_bottle',
    'glassenr': 'item_glass_enr_bottle',
    'cuprium': 'item_cuprium_bottle',
    'hetonite': 'item_hetonite_bottle',
}
CONTENT = {
    'water': 'item_liquid_water',
    'sewage': 'item_sewage',
    'xiranite': 'item_liquid_xiranite',
    'heavy_xiranite': 'item_liquid_heavy_xiranite',
    'grass_1': 'item_liquid_plant_grass_1',
    'grass_2': 'item_liquid_plant_grass_2',
    'precip_acid': 'item_precipitation_acid',
    'xircon_effluent': 'item_xircon_effluent',
    'inert_xircon_effluent': 'item_inert_xircon_effluent',
}
GAS_CONTENT = {
    'cuprium_acridgen': 'item_acridgen',
    'cuprium_aquagen': 'item_aquagen',
    'cuprium_cuprium_gas': 'item_cuprium_gas',
    'cuprium_heavy_xiragen': 'item_heavy_xiragen',
    'cuprium_hetonite_gas': 'item_hetonite_gas',
    'cuprium_inergen': 'item_inergen',
    'cuprium_pyrrolite_gas': 'item_pyrrolite_gas',
    'cuprium_xiragen': 'item_xiragen',
}


def load(item_id):
    p = os.path.join(SRC, 'items', item_id + '.webp')
    if not os.path.exists(p):
        return None
    return Image.open(p).convert('RGBA')


def body_anchor(im):
    """Centre of the vessel's belly: centroid of the widest 30% of its scanlines."""
    a = np.asarray(im)[:, :, 3]
    ys, _ = np.nonzero(a > 48)
    if len(ys) == 0:
        return 0.5, 0.5, 0.4
    rows = []
    for y in range(int(ys.min()), int(ys.max()) + 1):
        r = np.nonzero(a[y] > 48)[0]
        if len(r):
            rows.append((len(r), y, int(r.min()), int(r.max())))
    rows.sort(reverse=True)
    top = rows[:max(3, int(len(rows) * 0.30))]
    cy = float(np.mean([t[1] for t in top]))
    cx = float(np.mean([(t[2] + t[3]) / 2 for t in top]))
    bulge = float(np.mean([t[0] for t in top]))
    return cx / im.width, cy / im.height, bulge / im.width


def compose(bottle_id, content_id, out_id, fill=0.88):
    base = load(bottle_id)
    content = load(content_id)
    if base is None or content is None:
        return False, f'missing src for {out_id}'
    base = base.resize((CANVAS, CANVAS), Image.LANCZOS)
    nx, ny, bulge = body_anchor(base)
    box = max(24, int(CANVAS * bulge * fill))
    c = content.resize((box, box), Image.LANCZOS)
    cx = int(nx * CANVAS - box / 2)
    cy = int(ny * CANVAS - box / 2)
    # drop the content in with a soft dark rim so it reads on bright glass
    rim = Image.new('RGBA', c.size, (0, 0, 0, 0))
    rim.paste((20, 18, 16, 110), (0, 0), c.split()[3].point(lambda v: 255 if v > 110 else 0))
    out = base.copy()
    out.alpha_composite(rim, (cx, cy))
    out.alpha_composite(c, (cx, cy))
    os.makedirs(os.path.join(SRC, 'items'), exist_ok=True)
    out.save(os.path.join(SRC, 'items', out_id + '.webp'), 'WEBP', quality=92, method=6)
    return True, ''


def main():
    jobs = []
    for iid in sorted(os.listdir(os.path.join(SRC, 'items'))):
        pass
    # discover every fbottle_* / gasjar_* id from the data set
    import json
    data = json.load(open(os.path.join(ROOT, 'endfield_recipes.json'), encoding='utf-8'))
    ids = [i['id'] for i in data['items']]
    for iid in ids:
        if iid.startswith('item_fbottle_'):
            rest = iid[len('item_fbottle_'):]
            if rest == 'ferrium_heavy_xiranite':
                key, ckey = 'iron', 'heavy_xiranite'
            else:
                parts = rest.split('_', 1)
                if len(parts) != 2:
                    continue
                key, ckey = parts
            if key in BOTTLE_BASE and ckey in CONTENT:
                jobs.append((BOTTLE_BASE[key], CONTENT[ckey], iid))
        elif iid == 'item_event_fbottle_heavy_xiranite_grass_2':
            jobs.append(('item_event_heavy_xiranite_bottle', CONTENT['grass_2'], iid))
        elif iid.startswith('item_gasjar_'):
            rest = iid[len('item_gasjar_'):]
            if rest in GAS_CONTENT:
                jobs.append(('item_cuprium_canister', GAS_CONTENT[rest], iid))

    done = fail = 0
    for b, c, o in jobs:
        ok, msg = compose(b, c, o)
        if ok:
            done += 1
        else:
            fail += 1
            print('FAIL', o, msg)
    print(f'composed {done}, failed {fail}')


if __name__ == '__main__':
    main()
