// Generate a self-contained interactive HTML recipe-tree viewer.
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('endfield_recipes.json', 'utf8'));
const NAME_FIX = { item_cuprium_ore: '赤铜矿石' };
for (const it of raw.items) if (NAME_FIX[it.id]) it.names.zh = NAME_FIX[it.id];

const data = {
  generatedAt: raw.extractedAt.slice(0, 10),
  source: raw.source,
  items: raw.items.map(i => ({ i: i.id, n: i.names.zh, t: i.tier, c: i.category, b: i.isBaseResource ? 1 : 0 })),
  fac: raw.facilities.map(f => ({ i: f.id, n: f.names.zh, p: f.powerConsumption, c: f.category })),
  rec: raw.recipes.map(r => ({
    i: r.id, f: r.facilityId, t: r.craftingTime,
    in: r.inputs.map(x => [x.itemId, x.amount]),
    out: r.outputs.map(x => [x.itemId, x.amount]),
    ...(r.availability ? { ev: 1 } : {}),
    ...(r.requiredGasEnv ? { ge: r.requiredGasEnv } : {}),
    ...(r.producedGasEnv ? { pg: r.producedGasEnv } : {}),
    ...(r.producedPowerW ? { pw: r.producedPowerW } : {}),
  })),
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>明日方舟：终末地 — 工业配方树</title>
<style>
:root{
  --bg:#0f1115; --panel:#171a21; --panel2:#1e222b; --border:#2b3140;
  --fg:#e6e9ef; --muted:#98a0b3; --accent:#4ea1ff; --accent2:#ffc857;
  --raw:#7ee787; --gather:#6fd3c7; --cycle:#ff8f6b; --ev:#c58fff;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:14px/1.6 "Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif}
header{padding:14px 20px;border-bottom:1px solid var(--border);background:var(--panel);
  position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:10px;align-items:baseline}
h1{font-size:16px;margin:0;font-weight:600}
header .meta{color:var(--muted);font-size:12px}
header .meta a{color:var(--accent);text-decoration:none}
.layout{display:grid;grid-template-columns:300px 1fr;min-height:calc(100vh - 52px)}
aside{border-right:1px solid var(--border);background:var(--panel);padding:12px;
  max-height:calc(100vh - 52px);overflow:auto;position:sticky;top:52px}
main{padding:18px 22px 60px;overflow:visible}
input[type=search],select{width:100%;padding:7px 10px;background:var(--panel2);color:var(--fg);
  border:1px solid var(--border);border-radius:8px;font:inherit;font-size:13px;outline:none}
input[type=search]:focus,select:focus{border-color:var(--accent)}
.itemlist{margin-top:10px}
.group{color:var(--muted);font-size:11px;letter-spacing:.08em;margin:12px 0 5px;text-transform:uppercase}
.it{display:flex;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:7px;
  cursor:pointer;font-size:13px}
.it:hover{background:var(--panel2)}
.it.sel{background:#243043;color:#fff;box-shadow:inset 2px 0 0 var(--accent)}
.it .cnt{color:var(--muted);font-size:11px;flex:none}
.it.sel .cnt{color:#bcd4ff}
.tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.tab{padding:6px 14px;border-radius:999px;border:1px solid var(--border);background:var(--panel);
  cursor:pointer;font-size:13px;color:var(--muted)}
.tab.on{background:var(--accent);border-color:var(--accent);color:#06121f;font-weight:600}
h2{font-size:20px;margin:0 0 2px}
.sub{color:var(--muted);font-size:12px;margin-bottom:14px}
.sub code{color:var(--accent2)}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px}
legend{font-size:12px;color:var(--muted)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:12px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.tree{font-size:13px;line-height:1.5}
.tree details{margin-left:14px;border-left:1px dashed var(--border);padding-left:10px}
.tree details[open]>summary::marker{content:""}
.tree summary{cursor:pointer;list-style:none;padding:2px 0;display:flex;flex-wrap:wrap;
  align-items:baseline;gap:8px;border-radius:6px}
.tree summary::-webkit-details-marker{display:none}
.tree summary:hover{background:#ffffff08}
.tree summary select{max-width:min(520px,100%);margin-left:auto;background:#131722;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:2px 6px;font:inherit;font-size:11px}
.rootline{font-size:15px;font-weight:600;padding:6px 0;display:flex;flex-wrap:wrap;gap:10px;align-items:baseline}
.nm{font-weight:500}
.amt{color:var(--accent2);font-variant-numeric:tabular-nums}
.mach{background:#243043;color:#a9c8ff;border-radius:5px;padding:1px 7px;font-size:11px;white-space:nowrap}
.ratio{color:var(--muted);font-size:11px}
.tag{border-radius:5px;padding:1px 7px;font-size:11px;white-space:nowrap}
.t-raw{background:#14301c;color:var(--raw)}
.t-gather{background:#12302e;color:var(--gather)}
.t-cycle{background:#3a1f16;color:var(--cycle)}
.t-ev{background:#2c1d3d;color:var(--ev)}
.tier{color:var(--muted);font-size:11px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{text-align:left;padding:6px 9px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:500;position:sticky;top:52px;background:var(--bg);z-index:5}
tbody tr:hover{background:#ffffff07}
td.mono,.mono{font-family:Consolas,monospace;font-size:11.5px;color:var(--muted)}
.arrow{color:var(--muted);padding:0 3px}
.facname{font-weight:600;color:#a9c8ff}
.hidden{display:none}
.empty{color:var(--muted);padding:20px 0}
.count{color:var(--muted);font-size:12px;margin:8px 0}
@media(max-width:760px){.layout{grid-template-columns:1fr}aside{position:static;max-height:280px;border-right:0;border-bottom:1px solid var(--border)}}
</style>
</head>
<body>
<header>
  <h1>明日方舟：终末地 · 工业配方树</h1>
  <span class="meta">数据来源 <a href="${data.source}" target="_blank">gameheads.gg</a> · 抓取 ${data.generatedAt} ·
  ${raw.stats.recipes} 条配方 / ${raw.stats.items} 种工业物品 / ${raw.stats.facilities} 台机器</span>
</header>
<div class="layout">
  <aside>
    <input type="search" id="q" placeholder="搜索物品（中文名 / 英文ID）…">
    <div class="count" id="cnt"></div>
    <div class="itemlist" id="list"></div>
  </aside>
  <main>
    <div class="tabs">
      <div class="tab on" data-t="tree">物品生产树</div>
      <div class="tab" data-t="all">全部配方表</div>
      <div class="tab" data-t="machine">按机器查看</div>
      <div class="tab" data-t="raw">原料与终端产物</div>
    </div>
    <div id="treeTab"></div>
    <div id="allTab" class="hidden"></div>
    <div id="machineTab" class="hidden"></div>
    <div id="rawTab" class="hidden"></div>
  </main>
</div>
<script>
const DATA = ${JSON.stringify(data)};
const ITEM = new Map(DATA.items.map(x => [x.i, x]));
const FAC  = new Map(DATA.fac.map(x => [x.i, x]));
const nameOf = id => (ITEM.get(id) || {}).n || id;
const facOf  = id => (FAC.get(id)  || {}).n || id;

const byOutput = new Map(), byInput = new Map();
for (const r of DATA.rec) {
  for (const [id] of r.out) { if(!byOutput.has(id)) byOutput.set(id, []); byOutput.get(id).push(r); }
  for (const [id] of r.in)  { if(!byInput.has(id))  byInput.set(id, []);  byInput.get(id).push(r); }
}
const GATHER = new Set(['natural_resource','collection_material']);
const isGathered = it => !!it && (it.b === 1 || GATHER.has(it.c));

const INF = 1e9;
const depth = new Map();
{
  for (const it of DATA.items) depth.set(it.i, (!byOutput.has(it.i) || isGathered(it)) ? 0 : INF);
  const keys = [...byOutput.keys()];
  for (let p = 0; p <= keys.length + 1; p++) {
    let ch = false;
    for (const id of keys) {
      let best = INF;
      for (const r of byOutput.get(id)) {
        let worst = 0;
        for (const [iid] of r.in) {
          const d = depth.get(iid);
          if (d === undefined || d >= INF) { worst = INF; break; }
          if (d > worst) worst = d;
        }
        const v = worst >= INF ? INF : worst + 1;
        if (v < best) best = v;
      }
      if (best < depth.get(id)) { depth.set(id, best); ch = true; }
    }
    if (!ch) break;
  }
}
const DISMANTLER = 'item_port_dismantler_1';
const score = (r, itemId) => {
  let s = 0;
  if (r.f === DISMANTLER) s += 100000;
  if (r.ev) s += 50000;
  let deepest = 0, sum = 0;
  for (const [iid] of r.in) {
    const d = Math.min(depth.get(iid) ?? INF, 9999);
    sum += d; if (d > deepest) deepest = d;
  }
  const y = (r.out.find(o => o[0] === itemId) || [null, 1])[1];
  return s + deepest * 1000 + sum * 10 + r.in.length * 5 + r.t * 0.1 + (2 / y) * 10;
};
const primary = id => {
  const c = byOutput.get(id);
  if (!c || !c.length) return null;
  return c.slice().sort((a,b) => score(a,id) - score(b,id) || a.i.localeCompare(b.i))[0];
};

// item -> recipes it feeds (for the reverse view)
const fmt = n => {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function treeHTML(itemId, amount, ancestors, choices) {
  const it = ITEM.get(itemId);
  const cands = byOutput.get(itemId) || [];
  const amt = '<span class="amt">×' + fmt(amount) + '</span>';
  const nm  = '<span class="nm">' + esc(nameOf(itemId)) + '</span>';

  if (!cands.length) return '<div>' + nm + ' ' + amt + ' <span class="tag t-raw">基础原料 · 无配方</span></div>';
  if (isGathered(it)) return '<div>' + nm + ' ' + amt + ' <span class="tag t-gather">可采集原料</span></div>';
  if (ancestors.has(itemId)) return '<div>' + nm + ' ' + amt + ' <span class="tag t-cycle">↻ 循环引用</span></div>';

  const rec = choices.get(itemId) || primary(itemId);
  const outAmt = (rec.out.find(o => o[0] === itemId) || [null, 1])[1];
  const runs = amount / outAmt;
  const ratio = rec.in.map(([i,a]) => nameOf(i) + '×' + a).join(' + ') + ' → ' +
                rec.out.map(([i,a]) => nameOf(i) + '×' + a).join(' + ');
  const byp = rec.out.filter(o => o[0] !== itemId)
    .map(o => nameOf(o[0]) + '×' + o[1]).join(' 、 ');

  const picker = cands.length > 1
    ? ' <select data-pick="' + itemId + '">' + cands.map((r,k) =>
        '<option value="' + r.i + '"' + (r.i === rec.i ? ' selected' : '') + '>' +
        esc(facOf(r.f)) + ' ' + r.t + 's : ' + esc(r.in.map(([i,a]) => nameOf(i)+'×'+a).join('+')) +
        ' → ' + esc(r.out.map(([i,a]) => nameOf(i)+'×'+a).join('+')) +
        (r.ev ? ' ·限时' : '') + '</option>').join('') + '</select>'
    : '';

  const next = new Set(ancestors); next.add(itemId);
  const kids = rec.in.map(([iid, a]) => treeHTML(iid, a * runs, next, choices)).join('');

  const head = '<span>' + nm + ' ' + amt +
    ' <span class="mach">' + esc(facOf(rec.f)) + ' ' + rec.t + 's</span>' +
    (rec.ev ? ' <span class="tag t-ev">限时活动</span>' : '') +
    (rec.ge ? ' <span class="tag t-gather">需' + esc(rec.ge) + '气体环境</span>' : '') +
    (rec.pg ? ' <span class="tag t-gather">产出' + esc(rec.pg) + '气体环境</span>' : '') +
    (rec.pw ? ' <span class="tag t-raw">发电 ' + rec.pw + 'W</span>' : '') +
    '</span>' +
    '<span class="ratio">' + esc(ratio) + (byp ? ' ｜副产：' + esc(byp) : '') + '</span>' + picker;

  return '<details open><summary>' + head + '</summary>' + kids + '</details>';
}

function renderTree(itemId, choices) {
  const it = ITEM.get(itemId);
  const el = document.getElementById('treeTab');
  const usedIn = [...new Set((byInput.get(itemId) || []).map(r => r.i))];
  const madeBy = byOutput.get(itemId) || [];
  el.innerHTML =
    '<h2>' + esc(nameOf(itemId)) + '</h2>' +
    '<div class="sub">物品ID <code>' + esc(itemId) + '</code> · 层级 T' + (it && it.t || '?') +
      ' · 类别 ' + esc((it && it.c) || '-') +
      ' · 上游配方 ' + madeBy.length + ' 条 · 被 ' + usedIn.length + ' 条下游配方使用</div>' +
    '<div class="legend">' +
      '<span><span class="dot" style="background:var(--raw)"></span>基础原料（不可制造）</span>' +
      '<span><span class="dot" style="background:var(--gather)"></span>可采集原料（自然资源/采集材料）</span>' +
      '<span><span class="dot" style="background:var(--cycle)"></span>循环引用（上游已出现）</span>' +
      '<span><span class="dot" style="background:var(--ev)"></span>限时活动配方</span>' +
    '</div>' +
    '<div class="card"><div class="tree">' +
      '<details open><summary style="display:none"></summary>' +
      treeHTML(itemId, 1, new Set(), choices) + '</details>' +
    '</div></div>' +
    (usedIn.length ? '<div class="card"><b>下游用途</b>（该物品作为输入参与 ' + usedIn.length + ' 条配方）<div style="margin-top:8px">' +
      usedIn.map(id => {
        const r = DATA.rec.find(x => x.i === id);
        return '<div class="mono">' + esc(facOf(r.f)) + ' · ' +
          r.in.map(([i,a]) => esc(nameOf(i)) + '×' + a).join(' + ') + ' <span class="arrow">→</span> ' +
          r.out.map(([i,a]) => esc(nameOf(i)) + '×' + a).join(' + ') + '</div>';
      }).join('') + '</div></div>' : '');

  el.querySelectorAll('select[data-pick]').forEach(sel => {
    sel.addEventListener('change', ev => {
      ev.stopPropagation();
      choices.set(sel.dataset.pick, DATA.rec.find(r => r.i === sel.value));
      renderTree(itemId, choices);
    });
    sel.addEventListener('click', ev => ev.preventDefault());
  });
}

// ---------- sidebar ----------
let current = null;
function renderList(filter) {
  const q = (filter || '').trim().toLowerCase();
  const list = document.getElementById('list');
  const hits = DATA.items.filter(it =>
    !q || it.n.toLowerCase().includes(q) || it.i.toLowerCase().includes(q));
  document.getElementById('cnt').textContent = hits.length + ' / ' + DATA.items.length + ' 种物品';
  const groups = new Map();
  for (const it of hits) {
    const k = it.t || 9;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  let html = '';
  for (const k of [...groups.keys()].sort((a,b)=>a-b)) {
    html += '<div class="group">T' + k + '</div>';
    for (const it of groups.get(k).sort((a,b)=>a.n.localeCompare(b.n,'zh'))) {
      const n = (byOutput.get(it.i) || []).length;
      html += '<div class="it' + (it.i === current ? ' sel' : '') + '" data-id="' + esc(it.i) + '">' +
        '<span>' + esc(it.n) + '</span><span class="cnt">' + (n ? n + '配方' : '原料') + '</span></div>';
    }
  }
  list.innerHTML = html || '<div class="empty">无匹配物品</div>';
  list.querySelectorAll('.it').forEach(el => el.addEventListener('click', () => {
    current = el.dataset.id;
    renderList(document.getElementById('q').value);
    renderTree(current, new Map());
    showTab('tree');
  }));
}

// ---------- other tabs ----------
function renderAll() {
  const rows = DATA.rec.slice().sort((a,b) => a.f.localeCompare(b.f) || a.i.localeCompare(b.i));
  document.getElementById('allTab').innerHTML =
    '<h2>全部配方表（' + rows.length + ' 条）</h2>' +
    '<div class="sub">按机器分组排序，展示机器、耗时与完整配方比例。</div>' +
    '<div class="card" style="padding:0;overflow:auto;max-height:70vh"><table><thead><tr>' +
    '<th>机器</th><th>耗时</th><th>输入</th><th></th><th>产物</th><th>配方ID</th><th>备注</th></tr></thead><tbody>' +
    rows.map(r => '<tr>' +
      '<td class="facname">' + esc(facOf(r.f)) + '</td>' +
      '<td class="mono">' + r.t + 's</td>' +
      '<td>' + r.in.map(([i,a]) => esc(nameOf(i)) + ' <span class="amt">×' + a + '</span>').join(' + ') + '</td>' +
      '<td class="arrow">→</td>' +
      '<td>' + r.out.map(([i,a]) => esc(nameOf(i)) + ' <span class="amt">×' + a + '</span>').join(' + ') + '</td>' +
      '<td class="mono">' + esc(r.i) + '</td>' +
      '<td>' + [r.ev?'<span class="tag t-ev">限时</span>':'', r.ge?'需'+esc(r.ge)+'环境':'', r.pg?'产'+esc(r.pg)+'环境':'', r.pw?'发电'+r.pw+'W':''].filter(Boolean).join(' ') + '</td>' +
      '</tr>').join('') + '</tbody></table></div>';
}

function renderMachine() {
  const byFac = new Map();
  for (const r of DATA.rec) { if(!byFac.has(r.f)) byFac.set(r.f, []); byFac.get(r.f).push(r); }
  let html = '<h2>按机器查看</h2><div class="sub">每台机器可执行的配方，可直接对照游戏内配方书。</div>';
  for (const f of DATA.fac) {
    const list = byFac.get(f.i);
    if (!list) continue;
    html += '<div class="card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<b style="font-size:15px">' + esc(f.n) + '</b>' +
      '<span class="mono">' + list.length + ' 条配方 · 耗电 ' + (f.p ?? '-') + ' · ' + esc(f.c || '') + '</span></div>' +
      '<table style="margin-top:8px"><tbody>' +
      list.slice().sort((a,b)=>a.i.localeCompare(b.i)).map(r => '<tr>' +
        '<td style="width:42%">' + r.in.map(([i,a]) => esc(nameOf(i)) + ' <span class="amt">×' + a + '</span>').join(' + ') + '</td>' +
        '<td class="arrow" style="width:20px">→</td>' +
        '<td style="width:42%">' + r.out.map(([i,a]) => esc(nameOf(i)) + ' <span class="amt">×' + a + '</span>').join(' + ') + '</td>' +
        '<td class="mono">' + r.t + 's</td>' +
        '<td>' + (r.ev ? '<span class="tag t-ev">限时</span>' : '') + '</td>' +
        '</tr>').join('') + '</tbody></table></div>';
  }
  document.getElementById('machineTab').innerHTML = html;
}

function renderRaw() {
  const roots = DATA.items.filter(it => !byInput.has(it.i));
  const leaves = DATA.items.filter(it => !byOutput.has(it.i) || isGathered(it));
  const mk = (title, note, arr) => '<div class="card"><b>' + title + '</b> <span class="mono">' + arr.length + ' 种</span>' +
    '<div class="sub" style="margin:6px 0">' + note + '</div>' +
    arr.slice().sort((a,b)=>(a.t||9)-(b.t||9)||a.n.localeCompare(b.n,'zh'))
      .map(it => '<div class="it" data-goto="' + esc(it.i) + '" style="display:inline-flex;width:auto;margin:2px">' +
        esc(it.n) + ' <span class="cnt">T' + it.t + '</span></div>').join('') + '</div>';
  document.getElementById('rawTab').innerHTML =
    '<h2>原料与终端产物</h2>' +
    mk('基础原料 / 可采集原料', '生产树的叶子节点：无法通过机器制造，只能采集或在世界中获取。',
      leaves) +
    mk('终端产物', '不被任何机器配方消耗，是生产链的终点。', roots);
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
    current = el.dataset.goto;
    document.getElementById('q').value = '';
    renderList('');
    renderTree(current, new Map());
    showTab('tree');
  }));
}

function showTab(t) {
  for (const k of ['tree','all','machine','raw']) {
    document.getElementById(k + 'Tab').classList.toggle('hidden', k !== t);
  }
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('on', el.dataset.t === t));
}

document.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => showTab(el.dataset.t)));
document.getElementById('q').addEventListener('input', e => renderList(e.target.value));

renderAll(); renderMachine(); renderRaw();
current = 'item_carbon_mtl';
renderList('');
renderTree(current, new Map());
</script>
</body>
</html>`;

fs.writeFileSync('endfield_recipe_tree.html', html, 'utf8');
console.log('endfield_recipe_tree.html bytes:', Buffer.byteLength(html, 'utf8'));
