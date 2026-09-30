// Build the Endfield recipe deliverables from the extracted dataset.
// Outputs: endfield_recipes.json, recipes.csv, recipe_tree.md, recipe_tree.html
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('endfield_recipes.json', 'utf8'));

// The site ships no zh translation for item_cuprium_ore (falls back to "Cuprium Ore");
// the game's Chinese name is 赤铜矿石.
const NAME_FIX = { item_cuprium_ore: '赤铜矿石' };
let nameFixed = 0;
for (const it of raw.items) if (NAME_FIX[it.id] && it.names.zh !== NAME_FIX[it.id]) { it.names.zh = NAME_FIX[it.id]; nameFixed++; }
if (nameFixed) fs.writeFileSync('endfield_recipes.json', JSON.stringify(raw, null, 2), 'utf8');

const ITEM = new Map(raw.items.map(i => [i.id, i]));
const FAC = new Map(raw.facilities.map(f => [f.id, f]));
const name = (id) => ITEM.get(id)?.names.zh ?? id;
const facName = (id) => FAC.get(id)?.names.zh ?? id;

const byOutput = new Map();
const byInput = new Map();
for (const r of raw.recipes) {
  for (const o of r.outputs) {
    if (!byOutput.has(o.itemId)) byOutput.set(o.itemId, []);
    byOutput.get(o.itemId).push(r);
  }
  for (const i of r.inputs) {
    if (!byInput.has(i.itemId)) byInput.set(i.itemId, []);
    byInput.get(i.itemId).push(r);
  }
}

const DISMANTLER = 'item_port_dismantler_1';
// World-gatherable materials: the site's base-resource flag, plus natural / collection categories
// (plants and their seeds form a 种植机 <-> 采种机 loop that must be bootstrapped by gathering).
const GATHER_CATEGORIES = new Set(['natural_resource', 'collection_material']);
const isGathered = (it) => !!it && (it.isBaseResource || GATHER_CATEGORIES.has(it.category));

// Distance from raw materials: 0 for gatherable resources, else 1 + deepest input.
// Cycles never relax, so items reachable only through a loop stay at Infinity.
const INF = 1e9;
const depth = new Map();
{
  const itemsWithRecipe = [...byOutput.keys()];
  for (const i of raw.items) depth.set(i.id, (!byOutput.has(i.id) || isGathered(i)) ? 0 : INF);
  for (let pass = 0; pass < itemsWithRecipe.length + 2; pass++) {
    let changed = false;
    for (const itemId of itemsWithRecipe) {
      let best = INF;
      for (const r of byOutput.get(itemId)) {
        let worst = 0;
        for (const inp of r.inputs) {
          const d = depth.get(inp.itemId);
          if (d === undefined || d >= INF) { worst = INF; break; }
          if (d > worst) worst = d;
        }
        const v = worst >= INF ? INF : worst + 1;
        if (v < best) best = v;
      }
      if (best < depth.get(itemId)) { depth.set(itemId, best); changed = true; }
    }
    if (!changed) break;
  }
}

const score = (r, itemId) => {
  let s = 0;
  if (r.facilityId === DISMANTLER) s += 100000;  // 拆解是回收路线，不作为首选生产配方
  if (r.availability) s += 50000;                // 限时活动配方靠后
  let deepest = 0, sum = 0;
  for (const inp of r.inputs) {
    const d = Math.min(depth.get(inp.itemId) ?? INF, 9999);
    sum += d;
    if (d > deepest) deepest = d;
  }
  const yield_ = r.outputs.find(o => o.itemId === itemId)?.amount || 1;
  s += deepest * 1000 + sum * 10 + r.inputs.length * 5 + r.craftingTime * 0.1;
  s += (2 / yield_) * 10;                        // 同样条件下偏好单次产量更高的配方
  return s;
};
const primaryRecipe = (itemId) => {
  const c = byOutput.get(itemId);
  if (!c || !c.length) return null;
  return c.slice().sort((a, b) => score(a, itemId) - score(b, itemId) || a.id.localeCompare(b.id))[0];
};

// ---------------- CSV ----------------
{
  const maxIn = Math.max(...raw.recipes.map(r => r.inputs.length));
  const head = ['配方ID', '机器', '耗时秒', '产物'];
  for (let i = 1; i <= maxIn; i++) head.push(`输入${i}`, `输入${i}数量`);
  head.push('副产物', '限时活动');
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [head.join(',')];
  for (const r of raw.recipes.slice().sort((a, b) => a.facilityId.localeCompare(b.facilityId) || a.id.localeCompare(b.id))) {
    const row = [r.id, facName(r.facilityId), r.craftingTime,
      r.outputs.length ? r.outputs.map(o => `${name(o.itemId)}×${o.amount}`).join(' + ')
        : (r.producedPowerW ? `（无物品产出，仅发电 ${r.producedPowerW}W）` : '（无物品产出）')];
    for (let i = 0; i < maxIn; i++) {
      const inp = r.inputs[i];
      row.push(inp ? name(inp.itemId) : '', inp ? inp.amount : '');
    }
    row.push(r.availability ? '限时活动' : '');
    lines.push(row.map(esc).join(','));
  }
  fs.writeFileSync('recipes.csv', '\ufeff' + lines.join('\r\n'), 'utf8');
  console.log('recipes.csv rows:', lines.length - 1);
}

// ---------------- tree building ----------------
function buildTree(itemId, amount, ancestors, depth, opts = {}) {
  const { maxDepth = 40, usePrimaryOnly = true } = opts;
  const it = ITEM.get(itemId);
  const node = {
    itemId,
    name: name(itemId),
    amount: Math.round(amount * 1000) / 1000,
    tier: it?.tier ?? null,
    category: it?.category ?? null,
  };
  const cands = byOutput.get(itemId) || [];
  if (!cands.length) { node.kind = 'raw'; return node; }
  if (isGathered(it)) { node.kind = 'gather'; return node; }
  if (ancestors.has(itemId)) { node.kind = 'cycle'; return node; }
  if (depth >= maxDepth) { node.kind = 'truncated'; return node; }

  const rec = usePrimaryOnly ? primaryRecipe(itemId) : null;
  node.kind = 'craft';
  if (usePrimaryOnly) {
    node.allRecipeIds = cands.map(r => r.id);
    node.recipeId = rec.id;
    node.facility = facName(rec.facilityId);
    node.facilityId = rec.facilityId;
    node.craftingTime = rec.craftingTime;
    node.runs = amount / (rec.outputs.find(o => o.itemId === itemId)?.amount || 1);
    node.ratio = rec.inputs.map(i => `${name(i.itemId)}×${i.amount}`).join(' + ')
      + ' → ' + rec.outputs.map(o => `${name(o.itemId)}×${o.amount}`).join(' + ');
    const by = rec.outputs.filter(o => o.itemId !== itemId);
    if (by.length) node.byproducts = by.map(o => ({ name: name(o.itemId), amount: Math.round(o.amount * 1000) / 1000 }));
    const next = new Set(ancestors); next.add(itemId);
    node.inputs = rec.inputs.map(i =>
      buildTree(i.itemId, i.amount * node.runs, next, depth + 1, opts));
  } else {
    node.recipeIds = cands.map(r => r.id);
  }
  return node;
}

// ---------------- Markdown ----------------
{
  const out = [];
  out.push('# 明日方舟：终末地 — 工业配方总表（树状）\n');
  out.push(`> 数据来源：<https://gameheads.gg/zh/g/endfield/items>  ·  抓取时间 ${raw.extractedAt.slice(0, 10)}`);
  out.push(`> 覆盖 ${raw.stats.recipes} 条机器配方 / ${raw.stats.items} 种工业物品 / ${raw.stats.facilities} 台机器。`);
  out.push('> 「工业物品」判定：出现在任意一条机器配方中（作为输入或产物）。\n');

  const roots = raw.items.filter(i => !byInput.has(i.id));
  const leaves = raw.items.filter(i => !byOutput.has(i.id));

  out.push('## 一、总览\n');
  out.push(`- 工业物品：**${raw.stats.items}** 种（其中 ${raw.items.filter(i => i.category === 'industrial_product').length} 种游戏内类别为「工业产物」，其余为参与配方的自然资源 / 可用道具 / 采集材料）`);
  out.push(`- 机器配方：**${raw.stats.recipes}** 条`);
  out.push(`- 机器种类：**${raw.stats.facilities}** 种`);
  out.push(`- 无法再分解的原料（无配方产出）：${leaves.map(l => l.names.zh).join('、')}`);
  out.push(`- 终端产物（不被任何配方消耗）：${roots.length} 种\n`);

  out.push('## 二、机器一览\n');
  out.push('| 机器 | 配方数 | 耗电 | 类别 |');
  out.push('| --- | --- | --- | --- |');
  const facCount = {};
  for (const r of raw.recipes) facCount[r.facilityId] = (facCount[r.facilityId] || 0) + 1;
  for (const f of raw.facilities.slice().sort((a, b) => (facCount[b.id] || 0) - (facCount[a.id] || 0))) {
    out.push(`| ${f.names.zh} | ${facCount[f.id] || 0} | ${f.powerConsumption ?? '-'} | ${f.category ?? '-'} |`);
  }
  out.push('');

  // helper for drawing
  const draw = (node, prefix = '', isLast = true, isRoot = false) => {
    const lines = [];
    let label;
    const amt = `×${node.amount}`;
    if (node.kind === 'raw') label = `${node.name} ${amt}  ← 基础原料（无配方产出）`;
    else if (node.kind === 'gather') label = `${node.name} ${amt}  ← 可采集原料（${node.category === 'collection_material' ? '采集材料' : '自然资源'}）`;
    else if (node.kind === 'cycle') label = `${node.name} ${amt}  ↻ 循环引用（上游已出现，不再展开）`;
    else if (node.kind === 'truncated') label = `${node.name} ${amt}  … 层级过深已截断`;
    else label = `${node.name} ${amt}  【${node.facility} ${node.craftingTime}s │ ${node.ratio}】`;
    if (node.byproducts?.length) label += `  （副产：${node.byproducts.map(b => b.name + '×' + b.amount).join('、')}）`;
    if (isRoot) lines.push(label);
    else lines.push(prefix + (isLast ? '└─ ' : '├─ ') + label);
    const kids = node.inputs || [];
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    kids.forEach((k, i) => {
      lines.push(...draw(k, childPrefix, i === kids.length - 1, false));
    });
    return lines;
  };

  out.push('## 三、终端产物完整生产树\n');
  out.push('以下为 29 种不再被其他配方消耗的产物，自顶向下递归展开到原料。\n');
  for (const r of roots.slice().sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.names.zh.localeCompare(b.names.zh))) {
    out.push(`### ${r.names.zh}  \`${r.id}\`  T${r.tier}\n`);
    out.push('```');
    out.push(...draw(buildTree(r.id, 1, new Set(), 0), '', true, true));
    out.push('```\n');
  }

  out.push('## 四、全部工业物品的直接配方\n');
  out.push('每个物品一行，列出首选生产配方（机器、耗时、配方比例）。末列为该物品的其他可选配方数量。');
  out.push('机器配方默认按「非拆解机 → 非限时 → 输入种类少 → 耗时短」排序取首选，拆解机属于回收路线、限时配方属于活动内容，故排在后面。\n');
  out.push('| T | 物品 | 机器 | 耗时 | 配方比例（输入 → 产物） | 副产物 | 其他配方 |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const it of raw.items.slice().sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.names.zh.localeCompare(b.names.zh, 'zh'))) {
    const rec = primaryRecipe(it.id);
    if (!rec) { out.push(`| ${it.tier} | ${it.names.zh} | — | — | 原料，无配方产出 | — | 被 ${byInput.get(it.id)?.length ?? 0} 条配方使用 |`); continue; }
    const others = (byOutput.get(it.id)?.length ?? 1) - 1;
    const ins = rec.inputs.map(i => `${name(i.itemId)}×${i.amount}`).join(' + ') || '—';
    const outs = rec.outputs.map(o => `${name(o.itemId)}×${o.amount}`).join(' + ');
    const by = rec.outputs.filter(o => o.itemId !== it.id).map(o => `${name(o.itemId)}×${o.amount}`).join(' + ') || '—';
    out.push(`| ${it.tier} | ${it.names.zh} | ${facName(rec.facilityId)} | ${rec.craftingTime}s | ${ins} → ${outs} | ${by} | ${others || '—'} |`);
  }
  out.push('');
  out.push('## 五、全部配方原表（按机器分组）\n');
  const byFac = new Map();
  for (const r of raw.recipes) {
    if (!byFac.has(r.facilityId)) byFac.set(r.facilityId, []);
    byFac.get(r.facilityId).push(r);
  }
  for (const f of raw.facilities) {
    const list = byFac.get(f.id);
    if (!list) continue;
    out.push(`### ${f.names.zh}（${list.length} 条）\n`);
    out.push('| 配方ID | 耗时 | 输入 | 产物 | 备注 |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const r of list.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const ins = r.inputs.map(i => `${name(i.itemId)}×${i.amount}`).join(' + ') || '—';
      const outs = r.outputs.length
        ? r.outputs.map(o => `${name(o.itemId)}×${o.amount}`).join(' + ')
        : `（无物品产出${r.producedPowerW ? '，仅发电 ' + r.producedPowerW + 'W' : ''}）`;
      const note = [
        r.availability ? '限时活动' : '',
        r.requiredGasEnv ? `需${r.requiredGasEnv}气体环境` : '',
        r.producedGasEnv ? `产出${r.producedGasEnv}气体环境` : '',
        r.producedPowerW ? `发电 ${r.producedPowerW}W` : '',
      ].filter(Boolean).join('，') || '—';
      out.push(`| \`${r.id}\` | ${r.craftingTime}s | ${ins} | ${outs} | ${note} |`);
    }
    out.push('');
  }

  fs.writeFileSync('recipe_tree.md', out.join('\n'), 'utf8');
  console.log('recipe_tree.md lines:', out.length);
}

// ---------------- HTML ----------------
{
  const treeData = {};
  for (const it of raw.items) treeData[it.id] = buildTree(it.id, 1, new Set(), 0);

  const payload = {
    generatedAt: raw.extractedAt,
    source: raw.source,
    items: raw.items,
    facilities: raw.facilities,
    recipes: raw.recipes,
    primary: Object.fromEntries([...byOutput.keys()].map(k => [k, primaryRecipe(k)?.id ?? null])),
    usedIn: Object.fromEntries([...byInput.keys()].map(k => [k, [...new Set(byInput.get(k).map(r => r.id))]])),
  };
  fs.writeFileSync('recipe_data.js', 'window.ENDFIELD = ' + JSON.stringify(payload) + ';', 'utf8');
  console.log('recipe_data.js bytes:', fs.statSync('recipe_data.js').size);
}

// ---------------- tree JSON ----------------
{
  const trees = {};
  for (const it of raw.items) trees[it.id] = buildTree(it.id, 1, new Set(), 0);
  fs.writeFileSync('recipe_trees.json', JSON.stringify(trees, null, 1), 'utf8');
  console.log('recipe_trees.json bytes:', fs.statSync('recipe_trees.json').size);
}
