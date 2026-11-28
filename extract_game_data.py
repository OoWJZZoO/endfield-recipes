#!/usr/bin/env python3
"""Build endfield_recipes.json from the unpacked EndfieldData tables.

The dataset is derived from rmxlinux/EndfieldData at a pinned 1.7 commit:

    python extract_game_data.py --repo dev/EndfieldData --ref 19d202b

`--repo` may be a normal clone or a partial clone (`--filter=blob:none`); the
needed TableCfg files are read with `git show <ref>:TableCfg/...`, so no
checkout is required.  Table fields are mapped to the schema consumed by
build_chain.py; the only display-name adjustment is composing vessel names
from their content suffix (赤铜瓶 + 清水 -> 赤铜瓶（清水）).
"""
import argparse
import collections
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

GAME_VERSION = '1.7'
DATA_REF = '19d202b'  # rmxlinux/EndfieldData, "Update 11/27" (1.7)

TABLES = [
    'ItemTable', 'I18nTextTable_CN', 'I18nTextTable_EN', 'I18nTextTable_JP',
    'FactoryItemTable', 'FactoryMachineCraftTable', 'FactoryBuildingTable',
    'FactoryBuildingItemTable', 'FactoryBuildingTypeToNodeType',
    'FactoryFuelItemTable', 'FactoryVaporizerTable',
    'FactorySewageTreatImportTable', 'LimitedFormulaCraftIdReverseTable',
]

# 气体环境编号 -> 前端的环境键
ENV = {1: 'stable', 2: 'humid', 3: 'acidic', 4: 'xiranite'}

# 灌装瓶 / 耐压罐在解包表里的 name 只有通用瓶身名（如「赤铜瓶」），
# 这里按 id 后缀找到内容物，拼成「赤铜瓶（清水）」这种便于辨认的显示名。
VESSEL_CONTENT = {
    'water': 'item_liquid_water',
    'sewage': 'item_liquid_sewage',
    'grass_1': 'item_liquid_plant_grass_1',
    'grass_2': 'item_liquid_plant_grass_2',
    'xiranite': 'item_liquid_xiranite',
    'xiranite_enr': 'item_liquid_xiranite_enr',
    'xiranite_poly': 'item_liquid_xiranite_poly',
    'xiranite_lowpoly': 'item_liquid_xiranite_lowpoly',
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

# 配方来源表之外、按机具规则生成的配方
FUEL_FACILITY = 'item_port_power_sta_1'   # 热能池
VAPORIZER_FACILITY = 'item_port_vaporizer_1'  # 气体散布机
MAGIC_SPAWNER = 'item_port_magic_spawner_1'   # 明晦炉


def git_show(repo, ref, path):
    r = subprocess.run(['git', '-C', repo, 'show', '%s:%s' % (ref, path)],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        sys.exit('git show failed for %s: %s' % (path, r.stderr.decode('utf-8', 'replace').strip()))
    return json.loads(r.stdout.decode('utf-8'))


def load_tables(repo, ref):
    return {name: git_show(repo, ref, 'TableCfg/%s.json' % name) for name in TABLES}


def text(map_, tid):
    return map_.get(str(tid)) or None


def item_name(item, texts):
    tid = item['name']['id']
    return {
        'zh': text(texts['zh'], tid) or item['id'],
        'en': text(texts['en'], tid) or '',
        'ja': text(texts['ja'], tid) or '',
    }


def vessel_name(item_id, names, item_table, texts):
    """给灌装瓶 / 耐压罐拼上内容物：赤铜瓶 + 清水 -> 赤铜瓶（清水）。"""
    if item_id.startswith('item_fbottle_'):
        contents = VESSEL_CONTENT
    elif item_id.startswith('item_gasjar_'):
        contents = GAS_CONTENT
    else:
        return names
    if '（' in names['zh'] or '(' in names['en']:
        return names

    # 从最长后缀开始匹配，避免 copper 抢先匹配掉 copper_enr / copper_enr2
    for suffix in sorted(contents, key=len, reverse=True):
        if not item_id.endswith('_' + suffix):
            continue
        content = item_table.get(contents[suffix])
        if not content:
            break
        cname = item_name(content, texts)
        out = dict(names)
        if cname['zh']:
            out['zh'] = '%s（%s）' % (names['zh'], cname['zh'])
        if cname['en']:
            out['en'] = '%s (%s)' % (names['en'], cname['en'])
        if cname['ja']:
            out['ja'] = '%s（%s）' % (names['ja'], cname['ja'])
        return out
    return names


def flatten(groups):
    """把 [{group:[{id,count}, ...]}, ...] 摊平成 [{itemId, amount}]。"""
    out = []
    for slot in groups:
        for g in slot.get('group') or []:
            out.append({'itemId': g['id'], 'amount': g['count']})
    return out


def signature(recipe):
    return (tuple(sorted((x['itemId'], x['amount']) for x in recipe['inputs'])),
            tuple(sorted((x['itemId'], x['amount']) for x in recipe['outputs'])),
            tuple(sorted((x['itemId'], x['amount'], x['probability'])
                         for x in recipe.get('byproducts') or [])))


def build_recipes(tables, facility_of_machine):
    mc = tables['FactoryMachineCraftTable']
    limited = tables['LimitedFormulaCraftIdReverseTable']
    recipes = []

    for rid, r in mc.items():
        # 1.7 的 TableCfg 把明晦炉的阵列转化配方也挂在 magic_balancer_1 下，
        # 但 formation_magic_* 的产物是明 / 晦 / 衡物品，实际设备是明晦炉；
        # 平衡炉只负责 magic_balancer_1_* 的合成配方。
        facility = facility_of_machine.get(r['machineId'], r['machineId'])
        if rid.startswith('formation_magic_'):
            facility = MAGIC_SPAWNER
        recipe = {
            'id': rid,
            'facilityId': facility,
            # 解包数据里的 progressRound 就是游戏界面显示的单次耗时（秒）
            'craftingTime': r['progressRound'],
            'inputs': flatten(r['ingredients']),
            'outputs': flatten(r['outcomes']),
        }
        if r.get('gasEnv'):
            recipe['requiredGasEnv'] = ENV[r['gasEnv']]
        bp = r.get('byproduct') or {}
        if bp.get('id') and bp.get('prob'):
            recipe['byproducts'] = [{
                'itemId': bp['id'],
                'amount': bp['count'],
                'probability': bp['prob'],
            }]
        if rid in limited:
            # 只保留「是不是活动限时配方」这一事实，供默认配方排序使用；
            # 具体活动 id 与界面无关，不写进数据集。
            recipe['availability'] = {'eventId': limited[rid]}
        recipes.append(recipe)

    # 热能池：每种燃料一条，耗时 = 燃料的 progressRound，产出功率直接取表值
    for iid, fuel in tables['FactoryFuelItemTable'].items():
        recipes.append({
            'id': 'thermal_bank_%s_1' % iid,
            'facilityId': FUEL_FACILITY,
            'craftingTime': fuel['progressRound'],
            'inputs': [{'itemId': iid, 'amount': 1}],
            'outputs': [],
            'producedPowerW': fuel['powerProvide'],
        })

    # 气体散布机：每档环境一条，consumeRate 是每秒消耗量
    for group in tables['FactoryVaporizerTable']['vaporizer_1']['groups']:
        env = ENV[group['genEnv']]
        recipes.append({
            'id': 'vaporizer_%s_env_1' % env,
            'facilityId': VAPORIZER_FACILITY,
            'craftingTime': 1,
            'inputs': [{'itemId': group['consumeItem'], 'amount': group['consumeRate']}],
            'outputs': [],
            'producedGasEnv': env,
        })

    # 废水处理：污水接入口可接收的每种液体
    for gate, row in tables['FactorySewageTreatImportTable'].items():
        for liquid in row['liquidable']:
            recipes.append({
                'id': '%s_%s_1' % (gate, liquid),
                'facilityId': gate,
                'craftingTime': row['msPerRound'] / 1000.0,
                'inputs': [{'itemId': liquid, 'amount': 1}],
                'outputs': [],
            })

    # 需要环境的配方如果有同投入/产出的无环境版本，记下基础配方 id
    by_sig = collections.defaultdict(list)
    for r in recipes:
        if not r.get('requiredGasEnv'):
            by_sig[signature(r)].append(r['id'])
    for r in recipes:
        if r.get('requiredGasEnv'):
            candidates = by_sig.get(signature(r))
            if candidates:
                r['gasEnvBaseRecipeId'] = sorted(candidates)[0]

    return sorted(recipes, key=lambda r: r['id'])


def build_items(tables, used, texts):
    items = []
    for iid in sorted(used):
        it = tables['ItemTable'][iid]
        showing = it.get('showingType')
        category = 'industrial_product'
        if showing == 1:
            category = 'natural_resource'
        elif showing == 2:
            category = 'natural_resource'
        elif showing == 15:
            category = 'collection_material'
        # 消耗品：type 48 食物/药剂，type 52 战术物品（爆炸物等）
        if it.get('type') in (48, 52):
            category = 'consumable_item'

        phase = (tables['FactoryItemTable'].get(iid) or {}).get('phaseType')
        item = {
            'id': iid,
            'names': vessel_name(iid, item_name(it, texts), tables['ItemTable'], texts),
            'category': category,
            'tier': it.get('rarity') or 0,
            'isBaseResource': showing == 1,
        }
        if phase in (2, 4):
            item['transportMode'] = 'pipe'
        items.append(item)
    return items


def build_facilities(tables, ids, texts):
    b2i = tables['FactoryBuildingItemTable']
    buildings = tables['FactoryBuildingTable']
    node = tables['FactoryBuildingTypeToNodeType']
    facilities = []
    for fid in sorted(ids):
        it = tables['ItemTable'].get(fid)
        building_id = b2i.get(fid, {}).get('buildingId', fid)
        building = buildings.get(building_id, {})

        if it:
            names = item_name(it, texts)
            tier = it.get('rarity') or 0
        else:
            name_id = building.get('name', {}).get('id')
            names = {
                'zh': text(texts['zh'], name_id) or fid,
                'en': text(texts['en'], name_id) or '',
                'ja': text(texts['ja'], name_id) or '',
            }
            tier = building.get('rarity') or 0

        kind = node.get(str(building.get('type')), '')
        if kind in ('BurnPower', 'PowerStation'):
            category = 'power'
        elif kind in ('SewageTreatPlantImport', 'SewageTreatPlantExport'):
            category = 'utility'
        else:
            category = 'production'

        facilities.append({
            'id': fid,
            'names': names,
            'category': category,
            'tier': tier,
            'powerConsumption': building.get('powerConsume') or 0,
        })
    return facilities


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default=os.path.join(ROOT, 'dev', 'EndfieldData'),
                    help='rmxlinux/EndfieldData clone')
    ap.add_argument('--ref', default=DATA_REF, help='commit / tag to read')
    ap.add_argument('--out', default=os.path.join(ROOT, 'endfield_recipes.json'))
    args = ap.parse_args()

    tables = load_tables(args.repo, args.ref)
    texts = {
        'zh': tables['I18nTextTable_CN'],
        'en': tables['I18nTextTable_EN'],
        'ja': tables['I18nTextTable_JP'],
    }

    # buildingId -> 可放置的设备物品 id（前端机具 id 用物品 id）
    facility_of_machine = {row['buildingId']: row['itemId']
                           for row in tables['FactoryBuildingItemTable'].values()}

    data_date = subprocess.run(
        ['git', '-C', args.repo, 'show', '-s', '--format=%cs', args.ref],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout.decode().strip()

    recipes = build_recipes(tables, facility_of_machine)

    used = set()
    for r in recipes:
        for x in r['inputs'] + r['outputs'] + (r.get('byproducts') or []):
            used.add(x['itemId'])
    items = build_items(tables, used, texts)
    facilities = build_facilities(tables, {r['facilityId'] for r in recipes}, texts)

    dataset = {
        'source': 'https://github.com/rmxlinux/EndfieldData',
        'sourceRef': args.ref,
        'gameVersion': GAME_VERSION,
        'extractedAt': data_date + 'T00:00:00.000Z',
        'stats': {'items': len(items), 'recipes': len(recipes), 'facilities': len(facilities)},
        'items': items,
        'facilities': facilities,
        'recipes': recipes,
    }

    with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(dataset, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    print('wrote %s' % args.out)
    print('  items=%d facilities=%d recipes=%d' % (len(items), len(facilities), len(recipes)))
    print('  by facility: ' + ', '.join(
        '%s=%d' % (k, v) for k, v in collections.Counter(
            r['facilityId'] for r in recipes).most_common()))


if __name__ == '__main__':
    main()
