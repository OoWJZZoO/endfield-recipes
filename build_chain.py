#!/usr/bin/env python3
"""Assemble the self-contained native-style recipe-chain UI.

  python build_chain.py            -> endfield_chain.html
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ICON_PX = 96
DEFAULT_ROOT = 'item_liquid_heavy_xiranite'   # 液化重息壤

DISMANTLER = 'item_port_dismantler_1'
MIX_POOL = 'item_port_mix_pool_1'          # 反应池
MIX_POOL_ENR = 'item_port_mix_pool_2'      # 扩容反应池
GATHER_CATEGORIES = {'natural_resource', 'collection_material'}
INF = 1e9


# ---------------------------------------------------------------- 配方过滤
def is_liquid(item):
    """管道输送且不是气体 —— 与前端 familyOf() 同一口径"""
    zh = item['names'].get('zh') or ''
    return item.get('transportMode') == 'pipe' and '气态' not in zh and not zh.endswith('气')


def recipe_sig(r):
    """配方指纹：投入 / 产出 / 耗时 / 环境要求全都一样，就算同一条配方"""
    return (tuple(sorted((x['itemId'], x['amount']) for x in r['inputs'])),
            tuple(sorted((x['itemId'], x['amount']) for x in r['outputs'])),
            r['craftingTime'], r.get('requiredGasEnv') or '')


def filter_recipes(recipes, items):
    """剔掉对「看链路」没有意义的配方：
       1) 扩容反应池里与反应池完全相同的那几条 —— 升级的是机器不是配方，留着只是同一条配方的两份；
       2) 液体瓶拆解 —— 瓶装液体的反向操作，液体本来就能走管道，纯占位。"""
    pool = {recipe_sig(r) for r in recipes if r['facilityId'] == MIX_POOL}
    dropped = {'pool': 0, 'bottle': 0}
    out = []
    for r in recipes:
        if r['facilityId'] == MIX_POOL_ENR and recipe_sig(r) in pool:
            dropped['pool'] += 1
            continue
        if r['facilityId'] == DISMANTLER and any(
                o['itemId'] in items and is_liquid(items[o['itemId']]) for o in r['outputs']):
            dropped['bottle'] += 1
            continue
        out.append(r)
    return out, dropped


# ---------------------------------------------------------------- dataset
def load_dataset():
    raw = json.load(open(os.path.join(ROOT, 'endfield_recipes.json'), encoding='utf-8'))
    items = {i['id']: i for i in raw['items']}
    facs = {f['id']: f for f in raw['facilities']}
    recipes, dropped = filter_recipes(raw['recipes'], items)

    by_output = {}
    for r in recipes:
        for o in r['outputs']:
            by_output.setdefault(o['itemId'], []).append(r)

    def gathered(iid):
        it = items.get(iid)
        return bool(it and (it.get('isBaseResource') or it.get('category') in GATHER_CATEGORIES))

    # depth from raw materials (cycles never relax)
    depth = {}
    for iid, it in items.items():
        depth[iid] = 0 if (iid not in by_output or gathered(iid)) else INF
    for _ in range(len(items) + 2):
        changed = False
        for iid in by_output:
            best = INF
            for r in by_output[iid]:
                worst = 0
                for inp in r['inputs']:
                    d = depth.get(inp['itemId'])
                    if d is None or d >= INF:
                        worst = INF
                        break
                    worst = max(worst, d)
                best = min(best, INF if worst >= INF else worst + 1)
            if best < depth.get(iid, INF):
                depth[iid] = best
                changed = True
        if not changed:
            break

    def score(r, iid):
        s = 0.0
        if r['facilityId'] == DISMANTLER:
            s += 100000                       # 拆解是回收路线，不作首选
        if r.get('availability'):
            s += 50000                        # 限时活动配方靠后
        deepest = total = 0
        for inp in r['inputs']:
            d = min(depth.get(inp['itemId'], INF), 9999)
            total += d
            deepest = max(deepest, d)
        yield_ = next((o['amount'] for o in r['outputs'] if o['itemId'] == iid), 1) or 1
        s += deepest * 1000 + total * 10 + len(r['inputs']) * 5 + r['craftingTime'] * 0.1
        s += (2 / yield_) * 10                # 同等条件下偏好单次产量高的
        return s

    defaults = {}
    for iid, cands in by_output.items():
        defaults[iid] = sorted(cands, key=lambda r: (score(r, iid), r['id']))[0]['id']

    return raw, items, facs, recipes, defaults, gathered, dropped


# ---------------------------------------------------------------- icons
ICON_FILL = 0.92     # 归一化后美术占画布的比例，让所有图标在物品块里视觉大小一致


def icon_uri(path):
    im = Image.open(path).convert('RGBA')
    # 按 alpha 包围盒裁紧再等比缩放，消除源图留白不一致（0.59~1.00）
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(a > 18)
    if len(ys):
        pad = 1
        box = (max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad),
               min(im.width, int(xs.max()) + 1 + pad), min(im.height, int(ys.max()) + 1 + pad))
        im = im.crop(box)
    target = max(8, int(ICON_PX * ICON_FILL))
    sc = target / max(im.width, im.height)
    im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)
    canvas = Image.new('RGBA', (ICON_PX, ICON_PX), (0, 0, 0, 0))
    canvas.paste(im, ((ICON_PX - im.width) // 2, (ICON_PX - im.height) // 2), im)
    buf = io.BytesIO()
    canvas.save(buf, 'WEBP', quality=82, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def build_icons(items, facs):
    out = {}
    missing = []
    for iid in items:
        p = os.path.join(ROOT, 'assets', 'items', iid + '.webp')
        if os.path.exists(p):
            out[iid] = icon_uri(p)
        else:
            missing.append(iid)
    if missing:
        print(f'!! {len(missing)} items without an icon: {missing[:6]} ...', file=sys.stderr)
    return out


# ---------------------------------------------------------------- payload
def build_payload():
    raw, items, facs, recipes, defaults, gathered, dropped = load_dataset()

    payload = {
        'v': raw['extractedAt'][:10],          # 数据集版本，持久化状态随它失效
        'items': {iid: {
            'id': iid,
            'zh': it['names'].get('zh') or iid,
            'en': it['names'].get('en') or '',
            'tier': it.get('tier') or 0,
            'category': it.get('category') or '',
            'transport': it.get('transportMode') or '',
            'base': bool(it.get('isBaseResource')),
            'g': gathered(iid),
        } for iid, it in items.items()},
        'facilities': {fid: {
            'id': fid,
            'zh': f['names'].get('zh') or fid,
            'tier': f.get('tier') or 0,
            'category': f.get('category') or '',
            'power': f.get('powerConsumption') or 0,
        } for fid, f in facs.items()},
        'recipes': [{
            'id': r['id'],
            'fac': r['facilityId'],
            't': r['craftingTime'],
            'ins': [{'i': x['itemId'], 'a': x['amount']} for x in r['inputs']],
            'outs': [{'i': x['itemId'], 'a': x['amount']} for x in r['outputs']],
            'req': r.get('requiredGasEnv') or '',      # 需要的气体环境
            'env': r.get('producedGasEnv') or '',      # 蒸发机等产出的环境
            'base': r.get('gasEnvBaseRecipeId') or '', # 不带环境要求的同族配方
        } for r in recipes],
        'defaults': defaults,
        'defaultRoot': DEFAULT_ROOT,
    }
    icons = build_icons(items, facs)
    return payload, icons, dropped


# ---------------------------------------------------------------- assemble
def main():
    data, icons, dropped = build_payload()
    tpl = open(os.path.join(SRC, 'template.html'), encoding='utf-8').read()
    css = open(os.path.join(SRC, 'style.css'), encoding='utf-8').read()
    glyphs = open(os.path.join(SRC, 'glyphs.js'), encoding='utf-8').read()
    app = open(os.path.join(SRC, 'app.js'), encoding='utf-8').read()

    def js(o):
        return json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

    html = (tpl
            .replace('/*__CSS__*/', css)
            .replace('/*__GLYPHS__*/', glyphs)
            .replace('/*__DATA__*/', 'window.__DATA__=' + js(data) + ';')
            .replace('/*__ICON__*/', 'window.__ICON__=' + js({'items': icons, 'facilities': {}}) + ';')
            .replace('/*__APP__*/', app))

    out = os.path.join(ROOT, 'endfield_chain.html')
    # newline='\n'：Windows 上默认会把 '\n' 翻译成 CRLF，导致同一份源码在
    # Windows 与 Linux(CI) 产出的字节数不同，这里固定为 LF 以保证跨平台一致。
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)
    size = os.path.getsize(out)
    print(f'wrote {out}  ({size/1024/1024:.2f} MB)')
    print(f'  items={len(data["items"])} facilities={len(data["facilities"])} '
          f'recipes={len(data["recipes"])} icons={len(icons)} defaultRoot={data["defaultRoot"]}')
    print(f'  hidden recipes: 扩容反应池重复 {dropped["pool"]}，液体瓶拆解 {dropped["bottle"]}')


if __name__ == '__main__':
    main()
