#!/usr/bin/env python3
"""Compose filled-bottle / gas-canister icons the way the game does:
   bottle base artwork + the content icon pasted into the bottle body."""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'assets')
CANVAS = 256

# 1.5 解包数据的瓶身与内容 id
BOTTLE_BASE = {
    'copper': 'item_copper_bottle',
    'copperenr': 'item_copper_enr_bottle',
    'glass': 'item_glass_bottle',
    'glassenr': 'item_glass_enr_bottle',
    'iron': 'item_iron_bottle',
    'ironenr': 'item_iron_enr_bottle',
}
CONTENT = {
    'water': 'item_liquid_water',
    'sewage': 'item_liquid_sewage',
    'xiranite': 'item_liquid_xiranite',
    'xiranite_enr': 'item_liquid_xiranite_enr',
    'xiranite_poly': 'item_liquid_xiranite_poly',
    'xiranite_lowpoly': 'item_liquid_xiranite_lowpoly',
    'grass_1': 'item_liquid_plant_grass_1',
    'grass_2': 'item_liquid_plant_grass_2',
    'acid': 'item_liquid_acid',
    'copper': 'item_liquid_copper',
    'copper_enr': 'item_liquid_copper_enr',
}
GAS_CONTENT = {
    'acid': 'item_gas_acid',
    'water': 'item_gas_water',
    'inert': 'item_gas_inert',
    'xiranite': 'item_gas_xiranite',
    'xiranite_enr': 'item_gas_xiranite_enr',
    'copper': 'item_gas_copper',
    'copper_enr': 'item_gas_copper_enr',
    'copper_enr2': 'item_gas_copper_enr2',
    'copper_bright_clear': 'item_gas_copper_bright_clear',
    'copper_bright_turbid': 'item_gas_copper_bright_turbid',
    'copper_enr_heng': 'item_gas_copper_enr_heng',
    'xiranite_enr_heng': 'item_gas_xiranite_enr_heng',
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


def compose(bottle_id, content_id, out_id, fill=0.88, gas=False):
    base = load(bottle_id)
    content = load(content_id)
    if base is None or content is None:
        return False, f'missing src for {out_id}'
    base = base.resize((CANVAS, CANVAS), Image.LANCZOS)
    nx, ny, bulge = body_anchor(base)
    box = max(24, int(CANVAS * bulge * fill))
    c = content.resize((box, box), Image.LANCZOS)
    if gas:
        # 气体图标自带一层很淡的环境色光晕，整块贴进罐体后会露出方形底；
        # 去掉低 alpha 的光晕，只保留气体本身的团块。
        c.putalpha(c.getchannel('A').point(lambda v: 0 if v < 96 else v))
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


def vessel_recipe(item_id):
    """item_fbottle_<瓶身>_<内容> / item_gasjar_<瓶身>_gas_<气体> -> (瓶身图标, 内容图标)"""
    if item_id.startswith('item_fbottle_'):
        rest = item_id[len('item_fbottle_'):]
        for key in sorted(BOTTLE_BASE, key=len, reverse=True):
            if rest.startswith(key + '_'):
                content = rest[len(key) + 1:]
                if content in CONTENT:
                    return BOTTLE_BASE[key], CONTENT[content]
        return None
    if item_id.startswith('item_gasjar_'):
        content = item_id[len('item_gasjar_copper_gas_'):]
        if content in GAS_CONTENT:
            return 'item_copper_jar', GAS_CONTENT[content]
    return None


def main():
    data = json.load(open(os.path.join(ROOT, 'endfield_recipes.json'), encoding='utf-8'))
    done = fail = 0
    for it in data['items']:
        pair = vessel_recipe(it['id'])
        if not pair:
            continue
        ok, msg = compose(pair[0], pair[1], it['id'], gas=it['id'].startswith('item_gasjar_'))
        if ok:
            done += 1
        else:
            fail += 1
            print('FAIL', it['id'], msg)
    print(f'composed {done}, failed {fail}')


if __name__ == '__main__':
    main()
