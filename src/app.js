/* ============================================================
   终末地 · 制造链路 —— 仿原生 UI 渲染器
   ============================================================ */
(function () {
  'use strict';

  const D = window.__DATA__;
  const ICON = window.__ICON__;
  const FACGLYPH = window.FAC_GLYPH;
  const TILE_W = 64, TILE_H = 68, GAP_X = 26, GAP_ROW = 26;

  /* ---------------- 分类（仅用于图鉴筛选 / 归类） ---------------- */
  const FAM = {
    ore:     { n: '矿石' },
    plant:   { n: '植物' },
    seed:    { n: '种子' },
    liquid:  { n: '液体' },
    gas:     { n: '气体' },
    powder:  { n: '粉末' },
    metal:   { n: '金属块' },
    crystal: { n: '晶体与息壤' },
    part:    { n: '零件与元件' },
    vessel:  { n: '容器' },
    consum:  { n: '消耗品' },
    event:   { n: '活动与特殊' },
    misc:    { n: '杂项' },
  };

  /* 物品块底部色条 = 稀有度（tier），与游戏一致：白 → 绿 → 蓝 → 紫 → 金 → 红 */
  /* 气体环境：部分配方（气体反应炉 / 提纯机 / 息壤窑…）必须在特定环境里运行。
     这是配方级属性 —— 同一台机具的不同配方，有的需要有的不需要。 */
  const ENV_NAME = { stable: '稳定环境', humid: '湿润环境', acidic: '酸性环境', xiranite: '息壤环境' };
  const ENV_COL = { stable: '#31a7e0', humid: '#35c6d6', acidic: '#e8a32c', xiranite: '#ab6ce6' };
  const ENV_ICON = {
    stable: 'M8 2 L4.4 11 H6.9 V16 H9.1 V11 H11.6 Z M17.2 6 L13.6 15 H16.1 V19.2 H18.3 V15 H20.8 Z',
    humid: 'M12 4.2c-3.4 0-6.1 2.3-6.1 5.2 0 1 .3 1.9.8 2.7h10.6c.5-.8.8-1.7.8-2.7 0-2.9-2.7-5.2-6.1-5.2z'
      + ' M12 14.4c-1.9 2.4-2.9 3.9-2.9 5.1a2.9 2.9 0 1 0 5.8 0c0-1.2-1-2.7-2.9-5.1z',
    acidic: 'M12 2.4c3.6 1.5 5.4 4.2 5 8.4-3.7-.5-5.7-3.3-5-8.4z'
      + ' M4.9 8.6c3.3 1 4.9 3.3 4.6 7.2-3.4-.5-5.2-3-4.6-7.2z'
      + ' M18.6 12.6c3.2 1 4.7 3.2 4.4 6.9-3.3-.5-5-3-4.4-6.9z'
      + ' M11.9 14.1c2.6 1.1 3.8 3 3.5 6.3-2.6-.4-4-2.6-3.5-6.3z',
    xiranite: 'M12 2.2 4.6 8.6 12 21.8 19.4 8.6 Z M12 5.6 15.6 8.8 12 15.4 8.4 8.8 Z',
  };
  const envName = k => ENV_NAME[k] || k || '';
  const envCol = k => ENV_COL[k] || '#31a7e0';
  function envGlyph(k) {
    return `<svg viewBox="0 0 24 24" fill="#fff" fill-rule="evenodd"><path d="${ENV_ICON[k] || ENV_ICON.stable}"/></svg>`;
  }

  const TIER_COL = ['#e2e2e2', '#6dd04a', '#3fa9f5', '#a877e8', '#e8b23c', '#e05a4a'];
  const tierColor = t => TIER_COL[Math.min(Math.max((t || 1), 1), 6) - 1];
  const FAM_DARK = {};
  function famDark(hex) {
    if (!FAM_DARK[hex]) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      FAM_DARK[hex] = `rgb(${Math.round(r * .18 + 12)},${Math.round(g * .18 + 12)},${Math.round(b * .18 + 14)})`;
    }
    return FAM_DARK[hex];
  }

  const ORE = new Set(['item_originium_ore', 'item_quartz_sand', 'item_iron_ore', 'item_cuprium_ore']);
  const METAL = new Set(['item_iron_nugget', 'item_cuprium', 'item_hetonite', 'item_pyrrolite',
    'item_iron_enr', 'item_carbon_mtl', 'item_carbon_enr']);
  const CRYSTAL = new Set(['item_crystal_shell', 'item_crystal_enr', 'item_quartz_glass',
    'item_quartz_enr', 'item_xircon', 'item_xiranite_powder', 'item_heavy_xiranite']);
  const EMPTY_VESSEL = new Set(['item_iron_bottle', 'item_glass_bottle', 'item_glass_enr_bottle',
    'item_iron_enr_bottle', 'item_cuprium_bottle', 'item_hetonite_bottle', 'item_cuprium_canister']);

  // 按物品 id + 中文名判定，规则顺序即优先级
  function familyOf(it) {
    const id = it.id, zh = it.zh || '';
    if (/^item_(activity|event)_/.test(id)) return 'event';          // 活动 / 事件道具
    if (/^item_(fbottle|gasjar)_/.test(id) || EMPTY_VESSEL.has(id)) return 'vessel';
    if (id.indexOf('_powder') >= 0 && id !== 'item_xiranite_powder') return 'powder';
    if (ORE.has(id)) return 'ore';
    if (it.transport === 'pipe') return (zh.indexOf('气态') >= 0 || /气$/.test(zh)) ? 'gas' : 'liquid';
    if (id.indexOf('item_plant_') === 0) return id.indexOf('_seed_') >= 0 ? 'seed' : 'plant';
    if (METAL.has(id)) return 'metal';
    if (CRYSTAL.has(id)) return 'crystal';
    if (zh.indexOf('装备原件') >= 0 || zh.indexOf('零件') >= 0 ||
        id === 'item_separator_core' || /^item_proc_battery_/.test(id)) return 'part';
    if (it.category === 'consumable_item') return 'consum';
    return 'misc';
  }

  /* ---------------- 索引 ---------------- */
  const ITEMS = D.items, FAC = D.facilities;
  const REC = {}, BYOUT = {}, BYIN = {}, ENV = [];
  D.recipes.forEach(r => {
    REC[r.id] = r;
    if (!r.outs.length) { ENV.push(r); return; }
    r.outs.forEach(o => (BYOUT[o.i] = BYOUT[o.i] || []).push(r));
    r.ins.forEach(x => (BYIN[x.i] = BYIN[x.i] || []).push(r));
  });

  const overrides = Object.assign({}, D.defaults);
  const openDups = new Set(), openAlt = new Set(), userSet = new Set();

  /* ---------------- 视图状态 ---------------- */
  let curRoot = D.defaultRoot, history = [];
  let k = 1, tx = 0, ty = 0;
  let SHOW_AMOUNT = true, ANCHOR_2S = false;
  let view = 'chain';                 // 'chain' | 'codex'
  let nodes = [], worldW = 0, worldH = 0, CHIP_W = 196, SHOW_RATIO = true;

  const stage = document.getElementById('stage');
  const world = document.getElementById('world');
  const nodeLayer = document.getElementById('nodes');
  const svg = document.getElementById('edges');
  const panel = document.getElementById('panel');
  const results = document.getElementById('results');

  /* ---------------- 文本测量 ---------------- */
  const mctx = document.createElement('canvas').getContext('2d');
  const mc = new Map();
  function textW(s, font) {
    const key = font + '\u0000' + s;
    let v = mc.get(key);
    if (v === undefined) { mctx.font = font; v = mctx.measureText(s).width; mc.set(key, v); }
    return v;
  }
  const FF = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif';
  const F_R1 = '700 12.5px ' + FF, F_R2 = '600 10.5px ' + FF, F_R3 = '500 10px ' + FF;

  function pillW(label, withCount) {
    return 20 + 12 + 7 + textW(label, '700 11.5px ' + FF) + (withCount ? 22 : 0);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const trim = x => Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : String(Math.round(x * 100) / 100);
  const facName = id => (FAC[id] && FAC[id].zh) || id;
  const itemName = id => (ITEMS[id] && ITEMS[id].zh) || id;
  const mainOut = r => r.outs[0].a;
  const outAmtOf = (r, itemId) => { const o = r.outs.find(x => x.i === itemId); return (o || r.outs[0]).a; };

  /* ---------------- 构树 ---------------- */
  function build(rootId) {
    const seen = new Set();
    let uid = 0;

    function make(itemId, amount, path, anc) {
      const item = ITEMS[itemId] || { id: itemId, zh: itemId, tier: 0, category: '' };
      const recipe = pickRecipe(itemId);
      const n = {
        uid: uid++, itemId, item, amount, recipe, path,
        fam: familyOf(item), children: [], alt: [], stack: [], kind: 'craft',
      };
      n.famColor = tierColor(item.tier);
      // 可采集资源（含植物/种子/天然气）在游戏里是链路端点：默认不向上展开，但保留配方入口
      if (!recipe || item.g && !userSet.has(itemId)) {
        n.kind = recipe ? 'gather' : 'raw';
        n.runs = 1;
        const all = BYOUT[itemId] || [];
        if (recipe && all.length) {
          n.others = all;
          if (openAlt.has(path)) {
            n.alt = all.map((r, oi) => makeBranch(r, itemId, amount, path + '~' + oi, anc));
            n.stack = n.alt;
          }
        }
        n.recipe = null;   // 端点：不画机具胶囊
        return n;
      }
      n.runs = amount / outAmtOf(recipe, itemId);
      const wasSeen = seen.has(itemId);
      n.wasDup = wasSeen;
      if (anc.has(itemId)) { n.kind = 'loop'; return n; }
      if (wasSeen && !openDups.has(path)) { n.kind = 'dup'; return n; }
      seen.add(itemId);
      const anc2 = new Set(anc); anc2.add(itemId);
      recipe.ins.forEach((x, i) => {
        n.children.push(make(x.i, n.runs * x.a, path + '/' + x.i + (i ? '#' + i : ''), anc2));
      });
      const others = (BYOUT[itemId] || []).filter(r => r.id !== recipe.id);
      if (others.length) {
        n.others = others;
        if (openAlt.has(path)) {
          n.alt = others.map((r, oi) => makeBranch(r, itemId, amount, path + '~' + oi, anc));
        }
      }
      n.stack = n.children.concat(n.alt);
      return n;
    }

    // 备选配方分支：与主体共用同一个物品块，只新增机具胶囊与其上游
    function makeBranch(r, itemId, amount, path, anc) {
      const item = ITEMS[itemId];
      const br = {
        uid: uid++, itemId, item, amount, recipe: r, path,
        fam: familyOf(item), famColor: tierColor(item.tier),
        isBranch: true, children: [], alt: [], stack: [], kind: 'branch',
      };
      br.runs = amount / outAmtOf(r, itemId);
      const anc2 = new Set(anc); anc2.add(itemId);
      r.ins.forEach((x, i) => {
        br.children.push(make(x.i, br.runs * x.a, path + '/' + x.i + (i ? '#' + i : ''), anc2));
      });
      br.stack = br.children;   // 备选分支沿自身链向左展开
      return br;
    }
    // 「按2秒记」：把整条链路的时间基准锚到 2 秒 —— 各节点数量统一乘 2 / 主体单次耗时，
    // 于是物品块角标读作「每 2 秒需要多少」，主体读作「每 2 秒产出多少」。
    const rootRec = pickRecipe(rootId);
    const scale = (ANCHOR_2S && rootRec && !ITEMS[rootId].g) ? 2 / rootRec.t : 1;
    return make(rootId, scale, 'R:' + rootId, new Set());
  }

  // 取某物品当前选用的产出配方（用户切换过就用切换后的）
  function pickRecipe(itemId) {
    const rId = overrides[itemId];
    const cand = rId ? REC[rId] : null;
    return (cand && cand.outs.some(o => o.i === itemId)) ? cand : null;
  }

  /* ---------------- 比例 / 尺寸 ---------------- */
  function ratioParts(n) {
    const r = n.recipe, runs = n.runs;
    return {
      ins: r.ins.map(x => ({ n: itemName(x.i), a: trim(x.a * runs) })),
      outs: r.outs.map(x => ({ n: itemName(x.i), a: trim(x.a * runs), self: x.i === n.itemId })),
      by: r.outs.filter(x => x.i !== n.itemId).map(x => ({ n: itemName(x.i), a: trim(x.a * runs) })),
      selfBy: r.outs[0].i !== n.itemId,
      selfAmt: trim(outAmtOf(r, n.itemId) * runs),
    };
  }

  function metrics(n) {
    if (n.recipe) {
      const r = n.recipe;
      n.r1w = 15 + 5 + textW(facName(r.fac), F_R1);
      if (r.req) n.r1w = Math.max(n.r1w, 14 + 5 + textW(envName(r.req), '700 11.5px ' + FF));
      n.r2w = 10 + 4 + textW(trim(r.t) + '秒 · ×' + trim(n.runs) + '次', F_R2);
      const p = ratioParts(n);
      n.selfBy = p.selfBy;
      n.ratioText = p.ins.map(x => x.n + '×' + x.a).join(' + ') + ' → ' +
        p.outs.map(x => x.n + '×' + x.a).join(' + ');
      n.ratioBy = '';
      n.ratioHTML =
        p.ins.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ') +
        ' <span class="ar">→</span> ' +
        p.outs.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ');
    }
    (n.stack || []).forEach(metrics);
  }

  function calcChipWidth(root) {
    let w = 156;
    (function walk(n) {
      if (n.recipe) {
        const full = textW(n.ratioText, F_R3) + 22;
        w = Math.max(w, n.r1w + 20, n.r2w + 20, Math.min(full, 252));
      }
      (n.stack || []).forEach(walk);
    })(root);
    return Math.min(Math.max(w, 158), 276);
  }

  function wrapLines(txt, maxw) {
    if (textW(txt, F_R3) <= maxw) return 1;
    const parts = txt.split(/(\s(?:\+|→)\s)/);
    let lines = 1, cur = '';
    for (const p of parts) {
      if (cur && textW((cur + p).trim(), F_R3) > maxw) { lines++; cur = p; }
      else cur += p;
    }
    return Math.min(lines, 2);
  }

  function spans(n) {
    n.chipH = 0;
    if (n.recipe) {
      const lines = SHOW_RATIO ? wrapLines(n.ratioText, CHIP_W - 20) : 0;
      n.ratioLines = lines;
      n.chipH = (n.recipe.req ? 20 : 0) + 6 + 16 + 14 + (lines ? lines * 13 + 5 : 0) + 6;
    }
    n.anchorH = n.chipH || TILE_H;
    n.h = n.isBranch ? n.chipH : TILE_H;
    if (n.chipH) n.h = Math.max(n.h, n.chipH);
    if (n.others && n.others.length) n.h = Math.max(n.h, n.anchorH + (openAlt.has(n.path) ? 6 : 30));
    (n.stack || []).forEach(spans);
    let s = 0;
    for (const c of n.stack) s += c.span + GAP_ROW;
    n.childSpan = n.stack.length ? s - GAP_ROW : 0;
    n.span = Math.max(n.h, n.childSpan);
  }

  /* ---------------- 布局 ---------------- */
  function place(n, yTop) {
    let cy = yTop + (n.span - n.childSpan) / 2;
    for (const c of n.stack) { place(c, cy); cy += c.span + GAP_ROW; }
    if (n.children.length) {
      n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
    } else {
      n.y = yTop + n.span / 2;
    }
    if (!isFinite(n.y)) n.y = yTop + n.span / 2;   // 安全网
    const half = Math.max(n.h, n.chipH) / 2;
    if (n.span > Math.max(n.h, n.chipH)) {
      n.y = Math.max(n.y, yTop + half);
      n.y = Math.min(n.y, yTop + n.span - half);
    }
  }

  const COLS = [];
  function colX(c) {
    if (COLS[c] !== undefined) return COLS[c];
    let x = 0;
    for (let i = 1; i <= c; i++) {
      const pw = (i - 1) % 2 === 0 ? TILE_W : CHIP_W;
      const tw = i % 2 === 0 ? TILE_W : CHIP_W;
      x -= pw / 2 + GAP_X + tw / 2;
    }
    COLS[c] = x;
    return x;
  }
  function assignX(n, col) {
    n.col = col;
    if (!n.isBranch) n.x = colX(col);
    n.chipX = colX(col + 1);
    n.children.forEach(c => assignX(c, col + (n.recipe ? 2 : 0)));
    n.alt.forEach(b => assignX(b, col));
  }

  /* ---------------- 主渲染 ---------------- */
  let root = null;

  function render(rootId, opts) {
    opts = opts || {};
    if (view === 'codex') hideCodex();
    // 展开/收起备选链路时，让「链路主体」在屏幕上保持不动，避免视图跳走
    const keep = (root && opts.fit === false) ? (root.x * k + tx) + ',' + (root.y * k + ty) : null;
    curRoot = rootId;
    COLS.length = 0;
    root = build(rootId);
    metrics(root);
    CHIP_W = calcChipWidth(root);
    COLS.length = 0;
    spans(root);
    place(root, 0);
    assignX(root, 0);

    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    (function walk(n) {
      const l = n.isBranch ? n.chipX - CHIP_W / 2 : n.x - TILE_W / 2;
      const r = n.isBranch ? n.chipX + CHIP_W / 2 : n.x + TILE_W / 2;
      minX = Math.min(minX, l - 40);
      maxX = Math.max(maxX, r + 10);
      const top = n.y - Math.max(n.h, n.chipH) / 2 - 34;
      const bot = n.y + Math.max(n.h, n.chipH) / 2 + 34;
      minY = Math.min(minY, top); maxY = Math.max(maxY, bot);
      n.stack.forEach(walk);
    })(root);
    const ox = -minX + 30, oy = -minY + 20;
    (function shift(n) {
      if (!n.isBranch) n.x += ox;
      n.y += oy;
      if (n.chipX !== undefined) n.chipX += ox;
      n.stack.forEach(shift);
    })(root);
    worldW = maxX - minX + 60;
    worldH = maxY - minY + 40;

    nodes = [];
    (function collect(n) { nodes.push(n); n.stack.forEach(collect); })(root);

    drawEdges();
    drawNodes();

    svg.setAttribute('width', worldW);
    svg.setAttribute('height', worldH);
    svg.setAttribute('viewBox', `0 0 ${worldW} ${worldH}`);
    world.style.width = worldW + 'px';
    world.style.height = worldH + 'px';

    if (opts.fit !== false) fit();
    else if (keep) {
      const p = keep.split(',');
      tx += p[0] - (root.x * k + tx);
      ty += p[1] - (root.y * k + ty);
      apply();
    }
    updateCrumb();
  }

  /* ---------------- 连线 ---------------- */
  function ortho(x1, y1, x2, y2, mx, r) {
    r = r === undefined ? 9 : r;
    if (Math.abs(y1 - y2) < .6) return `M${x1} ${y1} H${x2}`;
    const dy = y2 > y1 ? 1 : -1;
    const sx = mx > x1 ? 1 : -1;
    const ex = x2 > mx ? 1 : -1;
    const rr = Math.max(0, Math.min(r, Math.abs(mx - x1) / 2, Math.abs(x2 - mx) / 2, Math.abs(y2 - y1) / 2));
    return `M${x1} ${y1} H${mx - sx * rr} Q${mx} ${y1} ${mx} ${y1 + dy * rr} ` +
           `V${y2 - dy * rr} Q${mx} ${y2} ${mx + ex * rr} ${y2} H${x2}`;
  }
  function plug(x, y, dir) {
    const a = dir > 0 ? x : x - 9;
    return `<rect x="${a}" y="${y - 4.3}" width="9" height="2.8" rx=".7"/>` +
           `<rect x="${a}" y="${y + 1.5}" width="9" height="2.8" rx=".7"/>`;
  }

  function pillW2(label, withCount) { return pillW(label, withCount); }

  function drawEdges() {
    const out = [];
    const lead = (x, y, w, bottomY) => {
      const sx = x + w, sy = y + 11, mx = sx + 15;
      return `<path class="e-lead" d="M${sx} ${sy} H${mx - 5} Q${mx} ${sy} ${mx} ${sy - 5} V${bottomY + 3}"/>`;
    };
    for (const n of nodes) {
      const chipL = n.chipX - CHIP_W / 2, chipR = n.chipX + CHIP_W / 2;
      // 金色胶囊的引导线
      if (n.others && n.others.length) {
        const open = openAlt.has(n.path);
        const w = pillW(open ? '收起' : '其他配方', !open);
        // 引导线只在「胶囊与机具分离」时有意义；端点节点的胶囊就贴在物品块下方，不画
        if (n.recipe) out.push(lead(chipL, n.y + n.anchorH / 2 + 7, w, n.y + n.chipH / 2));
      }
      if (!n.isBranch) {
        if (n.recipe) {
          // 输入块 → 机具
          for (const c of n.children) {
            const x1 = c.x + TILE_W / 2, y1 = c.y;
            const mx = x1 + (chipL - x1) / 2;
            out.push(`<path class="e-line" d="${ortho(x1, y1, chipL, n.y, mx)}"/>`);
            out.push(`<g class="e-plug">${plug(x1, y1, 1)}${plug(chipL - 9, n.y, 1)}</g>`);
          }
          // 机具 → 产物块
          const ax = chipR, bx = n.x - TILE_W / 2, cy = n.y;
          out.push(`<path class="e-line" d="M${ax} ${cy} H${bx}"/>`);
          out.push(`<g class="e-plug">${plug(ax, cy, 1)}${plug(bx - 9, cy, 1)}</g>`);
        }
        // 备选分支 → 产物块（细灰线）
        for (const b of n.alt) {
          const sy = b.y + (b.chipH ? 0 : 0), ex = n.x - TILE_W / 2, ey = n.y;
          const mx = (chipR + ex) / 2;
          out.push(`<path class="e-thin" d="${ortho(chipR, sy, ex, ey, mx)}"/>`);
        }
      } else {
        for (const c of n.children) {
          const x1 = c.x + TILE_W / 2, y1 = c.y;
          const mx = x1 + (chipL - x1) / 2;
          out.push(`<path class="e-thin" d="${ortho(x1, y1, chipL, n.y, mx)}"/>`);
        }
      }
    }
    svg.innerHTML = out.join('');
  }

  /* ---------------- 节点 ---------------- */
  function drawNodes() {
    const h = [];
    const iconURL = id => ICON.items[id] || PH;
    for (const n of nodes) {
      const fam = { c: tierColor(n.item.tier) };
      const isRoot = n.path === 'R:' + curRoot;

      if (n.wasDup) {
        const open = openDups.has(n.path);
        h.push(`<div class="eye${open ? ' open' : ''}" data-act="eye" data-path="${esc(n.path)}" ` +
          `style="left:${n.x - TILE_W / 2 - 31}px;top:${n.y - 11}px">` +
          eyeSVG() + `</div>`);
      }

      if (!n.isBranch) {
        const label = isRoot ? `<div class="tag-sub">链路主体</div>` : `<div class="btn">切换链路 ›</div>`;
        h.push(`<div class="tile${n.kind === 'dup' ? ' isdup' : ''}${isRoot ? ' root' : ''}" data-item="${esc(n.itemId)}" data-path="${esc(n.path)}" ` +
          `style="left:${n.x - TILE_W / 2}px;top:${n.y - TILE_H / 2}px;--fam:${fam.c};--fam-dark:${famDark(fam.c)}">` +
          `<div class="thumb"><div class="ruler"></div><img src="${iconURL(n.itemId)}" alt=""><div class="bar"></div></div>` +
          `<div class="hatch2"></div><div class="dots"></div>` +
          `<div class="amt${n.recipe ? '' : ' raw'}">×${trim(n.amount)}</div>` +
          `<div class="actions">${label}</div></div>`);
      }

      if (!n.recipe) continue;
      const r = n.recipe;
      const chipH = n.chipH;
      const lines = n.ratioLines || 0;
      h.push(`<div class="chip${n.isBranch ? ' altchip' : ''}${r.req ? ' hasenv' : ''}" data-path="${esc(n.path)}" ` +
        `style="left:${n.chipX - CHIP_W / 2}px;top:${n.y - chipH / 2}px;width:${CHIP_W}px;height:${chipH}px">` +
        (r.req ? `<div class="envband" style="background:${envCol(r.req)}">` +
          envGlyph(r.req) + `<span>${esc(envName(r.req))}</span></div>` : '') +
        `<div class="body">` +
        `<div class="r1"><svg viewBox="0 0 24 24"><path d="${FACGLYPH(r.fac)}" fill="#fff" fill-rule="evenodd"/></svg>` +
        `<span>${esc(facName(r.fac))}</span></div>` +
        `<div class="r2">${clockSVG()}<span>${trim(r.t)}秒 · ×${trim(n.runs)}次</span></div>` +
        (SHOW_RATIO ? `<div class="r3" style="height:${lines * 13 + 3}px">${n.ratioHTML}</div>` : '') +
        `</div></div>`);
    }
    // 标签与胶囊（端点节点也可能带配方入口）
    for (const n of nodes) {
      if (!n.recipe) {
        if (n.others && n.others.length) {
          const open = openAlt.has(n.path);
          const w = pillW(open ? '收起' : '其他配方', !open);
          h.push(`<div class="pill" data-act="alt" data-path="${esc(n.path)}" ` +
            `style="left:${Math.round(n.x - w / 2)}px;top:${n.y + n.anchorH / 2 + 7}px;width:${Math.round(w)}px;justify-content:center">` +
            `<span>${open ? '收起' : '其他配方'}</span>` +
            (open ? chevUpSVG() : swapSVG() + `<span class="cnt">${n.others.length}</span>`) + `</div>`);
        }
        continue;
      }
      const r = n.recipe;
      const showDefaultTab = !n.isBranch && n.others && openAlt.has(n.path);
      if (n.isBranch || showDefaultTab) {
        const isDefault = !n.isBranch;
        h.push(`<div class="tab${isDefault ? ' on' : ' clickable'}"${isDefault ? '' : ` data-act="setdef" data-item="${esc(n.itemId)}" data-rid="${esc(r.id)}"`} ` +
          `style="left:${n.chipX - CHIP_W / 2}px;top:${n.y - n.chipH / 2 - 23}px;width:${CHIP_W}px;height:30px">` +
          `<span>${isDefault ? '默认配方' : '设为默认配方'}</span><span class="radio"></span></div>`);
      }
      if (n.others && n.others.length) {
        const open = openAlt.has(n.path);
        const w = pillW(open ? '收起' : '其他配方', !open);
        h.push(`<div class="pill" data-act="alt" data-path="${esc(n.path)}" ` +
          `style="left:${n.chipX - CHIP_W / 2}px;top:${n.y + n.anchorH / 2 + 7}px;width:${Math.round(w)}px;justify-content:space-between">` +
          `<span>${open ? '收起' : '其他配方'}</span>` +
          (open ? chevUpSVG() : swapSVG() + `<span class="cnt">${n.others.length}</span>`) + `</div>`);
      }
    }
    nodeLayer.innerHTML = h.join('');
  }

  const PH = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M12 12h24v24H12z" fill="none" stroke="#777" stroke-width="2.5"/>' +
    '<path d="M17 24h14M24 17v14" stroke="#777" stroke-width="2.5"/></svg>');

  function eyeSVG() {
    return `<svg viewBox="0 0 24 24"><path d="M12 4.6C6.4 4.6 2.3 9 1 12c1.3 3 5.4 7.4 11 7.4S21.7 15 23 12c-1.3-3-5.4-7.4-11-7.4zm0 11.6a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4zm0-2.3a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z"/></svg>`;
  }
  function clockSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="8.6"/><path d="M12 7v5.4l3.4 2"/></svg>`;
  }
  function swapSVG() {
    return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 4.2h6.3v2.9h-6.3zM14.5 10.6h6.3v2.9h-6.3zM14.5 17h6.3v2.9h-6.3zM11.4 8.6 8 12l3.4 3.4-1.5 1.5L4.6 12l5.3-4.9zM4.4 6.2h5.2v2.4H4.4z"/></svg>`;
  }
  function chevUpSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M5 15l7-7 7 7"/></svg>`;
  }

  /* ---------------- 视图 ---------------- */
  let rasterTimer = 0;
  function apply() {
    // 浏览器/自动化可能把 overflow:hidden 的 stage 程序化滚动，这里强制归零
    if (stage.scrollLeft || stage.scrollTop) { stage.scrollLeft = 0; stage.scrollTop = 0; }
    // 位移取整，避免文字落在半像素上发虚
    world.style.transform = `translate(${Math.round(tx)}px,${Math.round(ty)}px) scale(${k})`;
    // 手势期间保留图层提升保证平移流畅；动作结束后取消提升，让浏览器按最终缩放缓格重绘。
    // 常驻 will-change 会让内容一直用旧位图放大，那正是文字发糊的原因。
    world.style.willChange = 'transform';
    clearTimeout(rasterTimer);
    rasterTimer = setTimeout(() => { world.style.willChange = 'auto'; }, 160);
    document.getElementById('pct').textContent = Math.round(k * 100) + '%';
    const zr = document.getElementById('zoomrange');
    if (document.activeElement !== zr) zr.value = String(Math.round(k * 100));
    world.classList.toggle('coarse', k < .34);
  }
  function fit() {
    const r = stage.getBoundingClientRect();
    const padX = 60, padTop = 92, padBot = 66;
    const kk = Math.min((r.width - padX * 2) / Math.max(worldW, 1), (r.height - padTop - padBot) / Math.max(worldH, 1));
    k = Math.max(.15, Math.min(kk, 1.3));
    tx = Math.max(30, (r.width - worldW * k) / 2);
    ty = padTop;
    apply();
  }
  function zoomAt(cx, cy, nk) {
    nk = Math.max(.15, Math.min(2.6, nk));
    const wx = (cx - tx) / k, wy = (cy - ty) / k;
    k = nk; tx = cx - wx * k; ty = cy - wy * k;
    apply();
  }

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
    zoomAt(e.clientX - r.left, e.clientY - r.top, k * Math.exp(-dy * 0.0014));
  }, { passive: false });

  // 注意：不要在 stage 上 setPointerCapture —— 指针捕获会把后续鼠标事件一并重定向到
  // 捕获元素，画布内的物品块/机具胶囊就再也收不到 click。改为窗口级监听。
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    drag = {
      x: e.clientX, y: e.clientY, tx, ty, moved: 0,
      onNode: !!e.target.closest('.tile, .chip, .pill, .eye, .tab'),
    };
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 4) stage.classList.add('dragging');
    tx = drag.tx + dx; ty = drag.ty + dy;
    apply();
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    stage.classList.remove('dragging');
    if (d.moved < 5 && !d.onNode) selectNode(null);
  });
  addEventListener('pointercancel', () => { drag = null; stage.classList.remove('dragging'); });

  /* ---------------- 交互 ---------------- */
  nodeLayer.addEventListener('click', e => {
    const eye = e.target.closest('.eye');
    if (eye) {
      const p = eye.dataset.path;
      openDups.has(p) ? openDups.delete(p) : openDups.add(p);
      render(curRoot, { fit: false }); return;
    }
    const pill = e.target.closest('.pill');
    if (pill) {
      const p = pill.dataset.path;
      openAlt.has(p) ? openAlt.delete(p) : openAlt.add(p);
      render(curRoot, { fit: false }); return;
    }
    const tab = e.target.closest('.tab.clickable');
    if (tab) {
      overrides[tab.dataset.item] = tab.dataset.rid;
      userSet.add(tab.dataset.item);
      render(curRoot, { fit: false });
      toast('已将「' + facName(REC[tab.dataset.rid].fac) + '」设为 ' + itemName(tab.dataset.item) + ' 的默认配方');
      const n = nodes.find(z => z.itemId === tab.dataset.item && z.recipe);
      if (n) openPanel(n);
      return;
    }
    const btn = e.target.closest('.tile .btn');
    if (btn) {
      const t = btn.closest('.tile');
      history.push(curRoot);
      render(t.dataset.item);
      selectNode(null);
      return;
    }
    const tile = e.target.closest('.tile');
    if (tile) {
      const n = nodes.find(z => z.path === tile.dataset.path);
      if (n) { selectNode(n); openPanel(n); }
      return;
    }
    const chip = e.target.closest('.chip');
    if (chip) {
      const n = nodes.find(z => z.path === chip.dataset.path);
      if (n) { selectNode(n); openPanel(n); }
    }
  });


  function selectNode(n) {
    nodeLayer.querySelectorAll('.tile.sel').forEach(t => t.classList.remove('sel'));
    if (n && !n.isBranch) {
      const el = nodeLayer.querySelector(`.tile[data-path="${cssEsc(n.path)}"]`);
      if (el) el.classList.add('sel');
    }
    if (!n) closePanel();
  }
  function cssEsc(s) { return s.replace(/["\\]/g, '\\$&'); }

  /* ---------------- 详情面板 ---------------- */
  let panelPath = null;
  function openPanel(n) {
    panelPath = n.path;
    const it = n.item, fam = { c: tierColor(it.tier), n: (FAM[n.fam] || FAM.misc).n };
    const H = [];
    H.push(`<div class="p-head"><img src="${ICON.items[it.id] || PH}" alt="">` +
      `<div><div class="nm">${esc(it.zh)}</div><div class="mt">` +
      `<span class="fam" style="background:#e8e6e1;color:#5a5751"><span class="swatch" style="--fam:${fam.c}"></span>${fam.n}</span>` +
      (it.tier ? `<span>T${it.tier}</span>` : '') +
      (it.base ? '<span>基础资源</span>' : '') +
      `</div></div><div class="x" data-act="close">✕</div></div>`);

    H.push(`<div class="sect"><h4>需求</h4>`);
    H.push(`<div class="kv"><span class="k">需要量</span><span class="v">×${trim(n.amount)}${n.recipe ? `　生产 <em>${trim(n.runs)}</em> 次` : ''}</span></div>`);
    if (n.recipe) {
      H.push(`<div class="kv"><span class="k">总耗时</span><span class="v">${trim(n.recipe.t)} × ${trim(n.runs)} = <em>${trim(n.recipe.t * n.runs)}</em> 秒</span></div>`);
      H.push(`<div class="kv"><span class="k">机具</span><span class="v">${esc(facName(n.recipe.fac))}</span></div>`);
    } else {
      H.push(`<div class="kv"><span class="k">来源</span><span class="v">${n.kind === 'loop' ? '循环依赖' : '基础资源 / 采集'}</span></div>`);
    }
    H.push('</div>');

    if (n.recipe && n.recipe.req) {
      const src = ENV.find(x => x.env === n.recipe.req);
      H.push(`<div class="sect"><h4>所需环境</h4><div class="kv"><span class="k">环境</span><span class="v">` +
        `<em style="color:${envCol(n.recipe.req)}">${esc(envName(n.recipe.req))}</em>` +
        (src ? `　由 ${esc(facName(src.fac))} 提供（消耗 ${esc(src.ins.map(x => itemName(x.i) + '×' + x.a).join(' + '))}）` : '') +
        `</span></div></div>`);
    }
    if (n.recipe && n.recipe.env) {
      H.push(`<div class="sect"><h4>产出环境</h4><div class="kv"><span class="k">环境</span><span class="v">` +
        `<em style="color:${envCol(n.recipe.env)}">${esc(envName(n.recipe.env))}</em>　不产出物品，供同区域机具使用</span></div></div>`);
    }
    if (n.recipe) {
      const r = n.recipe, p = ratioParts(n);
      H.push(`<div class="sect"><h4>配方比例（按本链路 ${trim(n.runs)} 次计）</h4><div class="ratio-box">` +
        p.ins.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ') +
        ` <span class="ar">→</span> ` +
        p.outs.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ') +
        `<br><span class="ar">单次配方　</span>` +
        esc(r.ins.map(x => itemName(x.i) + '×' + x.a).join(' + ')) + ' → ' + esc(it.zh) + '×' + mainOut(r) +
        `　·　${trim(r.t)} 秒/次</div></div>`);
      if (n.children.length) {
        H.push(`<div class="sect"><h4>直接投入</h4><div class="chips-inline">` +
          n.children.map(c => `<div class="ci" data-jump="${esc(c.itemId)}"><img src="${ICON.items[c.itemId] || PH}" alt="">` +
            `${esc(c.item.zh)}<span class="q">×${trim(c.amount)}</span></div>`).join('') + `</div></div>`);
      }
    }

    const others = BYOUT[n.itemId] || [];
    if (others.length) {
      H.push(`<div class="sect"><h4>可选配方（${others.length}）</h4>`);
      others.forEach(r => {
        const cur = n.recipe && r.id === n.recipe.id;
        H.push(`<div class="rec${cur ? ' cur' : ''}" data-act="setdef" data-item="${esc(n.itemId)}" data-rid="${esc(r.id)}">` +
          `<span class="dot2"></span><div style="flex:1">` +
          `<span class="fac">${esc(facName(r.fac))}</span> <span class="sub">${trim(r.t)} 秒</span><br>` +
          `<span class="sub">${esc(r.ins.map(x => itemName(x.i) + '×' + x.a).join(' + '))} → ${esc(it.zh)}×${mainOut(r)}</span>` +

          `</div></div>`);
      });
      H.push('</div>');
    }

    const uses = (BYIN[n.itemId] || []);
    if (uses.length) {
      const seenOut = new Set();
      const u = uses.filter(r => { const o = r.outs[0] && r.outs[0].i; if (!o || seenOut.has(o)) return false; seenOut.add(o); return true; });
      H.push(`<div class="sect"><h4>用于制造（${u.length}）</h4><div class="chips-inline">` +
        u.map(r => `<div class="ci" data-jump="${esc(r.outs[0].i)}"><img src="${ICON.items[r.outs[0].i] || PH}" alt="">` +
          `${esc(itemName(r.outs[0].i))}</div>`).join('') + `</div></div>`);
    }
    const envUse = ENV.filter(r => r.ins.some(x => x.i === n.itemId));
    if (envUse.length) {
      H.push(`<div class="sect"><h4>环境 / 能源用途</h4><div class="hintline">` +
        envUse.map(r => `${esc(facName(r.fac))}（消耗 ${esc(r.ins.map(x => itemName(x.i) + '×' + x.a).join(' + '))}）` +
          (r.producedGasEnv ? ` → ${({ stable: '稳定环境', humid: '湿润环境', acidic: '酸性环境', xiranite: '息壤环境' })[r.producedGasEnv] || r.producedGasEnv}` : '') +
          (r.producedPowerW ? ` → 发电 ${r.producedPowerW}W` : '')).join('<br>') + `</div></div>`);
    }
    H.push(`<div class="sect" style="padding-bottom:16px"><div class="hintline">` +
      `点击物品块下的「切换制造链路」把该物品设为主体；点击胶囊下的「其他配方」展开备选链路，可对比后设为默认。</div></div>`);
    panel.innerHTML = H.join('');
    panel.classList.add('on');
  }
  function closePanel() { panel.classList.remove('on'); panelPath = null; }

  panel.addEventListener('click', e => {
    if (e.target.closest('[data-act="close"]')) { closePanel(); return; }
    const def = e.target.closest('[data-act="setdef"]');
    if (def) {
      overrides[def.dataset.item] = def.dataset.rid;
      userSet.add(def.dataset.item);
      const keep = panelPath;
      render(curRoot, { fit: false });
      const n = nodes.find(z => z.path === keep) || nodes.find(z => z.itemId === def.dataset.item && z.recipe);
      if (n) openPanel(n);
      return;
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) { history.push(curRoot); render(jump.dataset.jump); selectNode(null); return; }
  });

  /* ---------------- 顶栏 / 搜索 ---------------- */
  function updateCrumb() {
    const inCodex = view === 'codex';
    document.getElementById('crumb-codex').classList.toggle('cur', inCodex);
    const itemEl = document.getElementById('crumb-item');
    const it = ITEMS[curRoot] || { zh: curRoot };
    itemEl.textContent = it.zh;
    itemEl.style.display = inCodex ? 'none' : '';
    document.getElementById('crumb-sep2').style.display = inCodex ? 'none' : '';
    document.title = inCodex ? '物品图鉴 · 终末地' : it.zh + ' · 终末地';
  }

  /* ---------------- 物品图鉴 ---------------- */
  const codex = document.getElementById('codex');
  const cxGrid = document.getElementById('cx-grid');
  const cxBar = document.getElementById('cx-bar');
  let cxFilter = 'all';

  const CX_ORDER = ['ore', 'plant', 'seed', 'liquid', 'gas', 'powder', 'metal', 'crystal',
    'part', 'vessel', 'consum', 'event', 'misc'];

  /* 图鉴排序沿用游戏物品图鉴的排列：溶液 → 气体 → 块与晶体 → 粉末 → 空瓶罐 →
     零件 → 装备原件 → 电池 → 灌装瓶罐 → 天然资源 → 消耗品 → 活动 → 杂项。
     未列入的物品按稀有度、名称排在最后。 */
  const BOTTLE_SEQ = ['glass', 'iron', 'glassenr', 'ironenr', 'cuprium', 'hetonite'];
  const CONTENT_SEQ = ['water', 'sewage', 'grass_1', 'grass_2', 'xiranite', 'heavy_xiranite',
    'precip_acid', 'xircon_effluent', 'inert_xircon_effluent'];
  const GASJAR_SEQ = ['aquagen', 'acridgen', 'xiragen', 'heavy_xiragen', 'inergen',
    'cuprium_gas', 'hetonite_gas', 'pyrrolite_gas'];

  const CX_SEQ = [
    'item_liquid_plant_grass_1', 'item_liquid_plant_grass_2', 'item_liquid_xiranite', 'item_liquid_heavy_xiranite',
    'item_xircon_effluent', 'item_inert_xircon_effluent', 'item_cuprium_solution', 'item_hetonite_solution', 'item_sewage',
    'item_aquagen', 'item_acridgen', 'item_heavy_xiragen', 'item_cuprium_gas', 'item_hetonite_gas', 'item_pyrrolite_gas',
    'item_carbon_mtl', 'item_crystal_shell', 'item_quartz_glass', 'item_iron_nugget', 'item_cuprium', 'item_carbon_enr',
    'item_crystal_enr', 'item_quartz_enr', 'item_iron_enr', 'item_hetonite', 'item_pyrrolite',
    'item_xiranite_powder', 'item_heavy_xiranite', 'item_xircon',
    'item_carbon_powder', 'item_originium_powder', 'item_crystal_powder', 'item_quartz_powder', 'item_iron_powder',
    'item_cuprium_powder', 'item_plant_moss_powder_3', 'item_plant_bbflower_powder_1',
    'item_plant_moss_enr_powder_1', 'item_plant_moss_enr_powder_2',
    'item_plant_grass_powder_1', 'item_plant_grass_powder_2', 'item_plant_moss_powder_1', 'item_plant_moss_powder_2',
    'item_carbon_enr_powder', 'item_originium_enr_powder', 'item_crystal_enr_powder',
    'item_quartz_enr_powder', 'item_iron_enr_powder',
    'item_glass_bottle', 'item_iron_bottle', 'item_glass_enr_bottle', 'item_iron_enr_bottle',
    'item_cuprium_bottle', 'item_hetonite_bottle', 'item_cuprium_canister',
    'item_glass_cmpt', 'item_iron_cmpt', 'item_glass_enr_cmpt', 'item_iron_enr_cmpt',
    'item_cuprium_cmpt', 'item_hetonite_cmpt', 'item_pyrrolite_cmpt',
    'item_equip_script_1', 'item_equip_script_2', 'item_equip_script_3', 'item_equip_script_4',
    'item_cuprium_enr_cmpt', 'item_hetonite_enr_cmpt', 'item_pyrrolite_enr_cmpt',
    'item_proc_battery_1', 'item_proc_battery_2', 'item_proc_battery_3',
    'item_proc_battery_4', 'item_proc_battery_5', 'item_separator_core',
  ].concat(BOTTLE_SEQ.reduce(
    (acc, k) => acc.concat(CONTENT_SEQ.map(c => 'item_fbottle_' + k + '_' + c)), [])
  ).concat([
    'item_fbottle_ferrium_heavy_xiranite',
  ]).concat(GASJAR_SEQ.map(c => 'item_gasjar_cuprium_' + c)).concat([
    'item_originium_ore', 'item_quartz_sand', 'item_iron_ore', 'item_cuprium_ore',
    'item_plant_moss_1', 'item_plant_moss_seed_1', 'item_plant_moss_2', 'item_plant_moss_seed_2',
    'item_plant_moss_3', 'item_plant_moss_seed_3', 'item_plant_bbflower_1', 'item_plant_bbflower_seed_1',
    'item_plant_grass_1', 'item_plant_grass_seed_1', 'item_plant_grass_2', 'item_plant_grass_seed_2',
    'item_plant_tundra_wood', 'item_liquid_water', 'item_precipitation_acid', 'item_inergen', 'item_xiragen',
    'item_plant_sp_1', 'item_plant_sp_2', 'item_plant_sp_3', 'item_plant_sp_4',
    'item_plant_sp_seed_1', 'item_plant_sp_seed_2', 'item_plant_sp_seed_3', 'item_plant_sp_seed_4',
    'item_bottled_food_1', 'item_bottled_food_2', 'item_bottled_food_3', 'item_bottled_food_4', 'item_bottled_food_5',
    'item_bottled_rec_hp_1', 'item_bottled_rec_hp_2', 'item_bottled_rec_hp_3', 'item_bottled_rec_hp_4', 'item_bottled_rec_hp_5',
    'item_proc_bomb_1',
    'item_activity_xiranite_nugget', 'item_activity_xiranite_lung', 'item_activity_xiranite_box',
    'item_activity_xiranite_enr_nugget', 'item_activity_xiranite_enr_lung', 'item_activity_xiranite_enr_box',
    'item_activity_copper_xiranite_tool', 'item_activity_copper_poly', 'item_activity_copper_poly_cmpt',
    'item_activity_copper_poly_gas', 'item_activity_copper_poly_tool',
    'item_event_xiranite_bottle', 'item_event_xiranite_cmpt', 'item_event_heavy_xiranite_bottle',
    'item_event_heavy_xiranite_cmpt', 'item_event_xiranite_gourd', 'item_event_xiranite_jade_gourd',
    'item_event_xiran_hue_atomizer', 'item_event_fbottle_heavy_xiranite_grass_2',
    'item_muck_feces_1', 'item_muck_xiranite_1',
  ]);
  const CX_RANK = {};
  CX_SEQ.forEach((id, i) => { if (CX_RANK[id] === undefined) CX_RANK[id] = i; });

  const cxCount = {};
  Object.keys(ITEMS).forEach(id => {
    const f = familyOf(ITEMS[id]);
    cxCount[f] = (cxCount[f] || 0) + 1;
  });

  function buildCodexBar() {
    const mk = (k, label, n) =>
      `<div class="cx-chip${cxFilter === k ? ' on' : ''}" data-fam="${k}">${esc(label)}<span>${n}</span></div>`;
    cxBar.innerHTML = mk('all', '全部', Object.keys(ITEMS).length) +
      CX_ORDER.filter(k => cxCount[k]).map(k => mk(k, FAM[k].n, cxCount[k])).join('');
  }

  function buildCodex() {
    buildCodexBar();
    const rank = id => CX_RANK[id] === undefined ? 1e6 + (ITEMS[id].tier || 0) * 1e4 : CX_RANK[id];
    const ids = Object.keys(ITEMS)
      .filter(id => cxFilter === 'all' || familyOf(ITEMS[id]) === cxFilter)
      .sort((a, b) => rank(a) - rank(b) ||
        (ITEMS[a].zh || '').localeCompare(ITEMS[b].zh || '', 'zh'));
    cxGrid.innerHTML = ids.map(id => {
      const it = ITEMS[id], c = tierColor(it.tier);
      return `<div class="cx-card" data-id="${esc(id)}" title="${esc(it.zh)} · T${it.tier || 1}">` +
        `<div class="cx-thumb" style="--fam:${c};--fam-dark:${famDark(c)}">` +
        `<div class="ruler"></div><img src="${ICON.items[id] || PH}" alt="">` +
        `<div class="cx-name">${esc(it.zh)}</div><div class="bar"></div></div></div>`;
    }).join('');
    document.getElementById('cx-note').textContent =
      `${ids.length} 件物品 · 点击任意物品查看它的制造链路`;
  }

  function showCodex() {
    view = 'codex';
    closePanel();
    selectNode(null);
    buildCodex();
    codex.classList.add('on');
    document.body.classList.add('in-codex');
    codex.scrollTop = 0;
    updateCrumb();
  }
  function hideCodex() {
    view = 'chain';
    codex.classList.remove('on');
    document.body.classList.remove('in-codex');
  }

  cxBar.addEventListener('click', e => {
    const c = e.target.closest('.cx-chip');
    if (!c) return;
    cxFilter = c.dataset.fam;
    buildCodex();
  });
  cxGrid.addEventListener('click', e => {
    const c = e.target.closest('.cx-card');
    if (!c) return;
    history.length = 0;
    render(c.dataset.id);
    selectNode(null);
  });

  const search = document.getElementById('search');
  const ALL = Object.keys(ITEMS).sort((a, b) => (ITEMS[a].zh || '').localeCompare(ITEMS[b].zh || '', 'zh'));

  function doSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) { results.classList.remove('on'); return; }
    const hit = ALL.filter(id => {
      const it = ITEMS[id];
      return (it.zh && it.zh.toLowerCase().includes(q)) || (it.en && it.en.toLowerCase().includes(q)) || id.includes(q);
    }).slice(0, 80);
    results.innerHTML = hit.length
      ? hit.map(id => `<div class="r" data-id="${esc(id)}"><img src="${ICON.items[id] || PH}" alt="">` +
          `<span>${esc(ITEMS[id].zh)}</span><span class="m">${BYOUT[id] ? BYOUT[id].length + ' 配方' : '基础资源'}</span></div>`).join('')
      : '<div class="empty">没有匹配的物品</div>';
    results.classList.add('on');
    const r = document.getElementById('search').getBoundingClientRect();
    results.style.left = r.left + 'px';
  }
  search.addEventListener('input', () => doSearch(search.value));
  search.addEventListener('focus', () => { if (search.value.trim()) doSearch(search.value); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.classList.remove('on'); search.blur(); }
    if (e.key === 'Enter') { const f = results.querySelector('.r'); if (f) pick(f.dataset.id); }
  });
  results.addEventListener('click', e => { const r = e.target.closest('.r'); if (r) pick(r.dataset.id); });
  function pick(id) {
    history.push(curRoot);
    render(id);
    selectNode(null);
    results.classList.remove('on');
    search.value = ''; search.blur();
  }
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#results') && !e.target.closest('#searchwrap')) results.classList.remove('on');
  });
  document.getElementById('backbtn').addEventListener('click', () => {
    if (!history.length) { showCodex(); return; }
    render(history.pop());
    selectNode(null);
  });
  document.getElementById('crumb-home').addEventListener('click', showCodex);
  document.getElementById('crumb-home-pill').addEventListener('click', showCodex);
  document.getElementById('crumb-codex').addEventListener('click', showCodex);

  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePanel(); results.classList.remove('on');
      selectNode(null);
    }
    if (e.key === 'f' || e.key === 'F') { if (!/input|textarea/i.test((e.target.tagName || ''))) fit(); }
  });

  document.getElementById('zoomrange').addEventListener('input', e => {
    const r = stage.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, Number(e.target.value) / 100);
  });
  document.getElementById('zoomfit').addEventListener('click', () => fit());

  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:60px;transform:translateX(-50%);z-index:99;' +
        'background:linear-gradient(180deg,#464646,#2c2c2c);color:#fff;font:700 12.5px ' + FF + ';' +
        'padding:7px 16px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.35);opacity:0;' +
        'transition:opacity .18s;pointer-events:none;white-space:nowrap';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 1800);
  }

  /* ---------------- 背景 ---------------- */
  function contours() {
    const w = innerWidth, h = innerHeight;
    const c = document.getElementById('contour');
    c.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let s = '';
    for (let b = 0; b < 14; b++) {
      const base = h * 0.5 + b * h * 0.052;
      let d = '';
      for (let x = -40; x <= w + 40; x += 40) {
        const y = base + Math.sin(x * 0.0021 + b * 0.85) * (16 + b * 2.4) +
          Math.sin(x * 0.0047 + b * 2.1) * 8 + Math.sin(x * 0.0009 + b) * 12;
        d += (x === -40 ? 'M' : 'L') + x + ' ' + y.toFixed(1) + ' ';
      }
      s += `<path d="${d}" fill="none" stroke="rgba(118,114,106,${(0.05 + b * 0.006).toFixed(3)})" stroke-width="1.2"/>`;
    }
    let ticks = '';
    for (let x = 0; x < w; x += 26) {
      ticks += `<rect x="${x}" y="0" width="1.3" height="${(x / 26) % 5 === 0 ? 7 : 4}" fill="rgba(140,136,128,.26)"/>`;
    }
    c.innerHTML = s + ticks;
  }
  addEventListener('resize', () => { contours(); apply(); });

  /* ---------------- 工具条 ---------------- */
  document.getElementById('tg-ratio').addEventListener('click', e => {
    SHOW_RATIO = !SHOW_RATIO;
    e.currentTarget.classList.toggle('on', SHOW_RATIO);
    render(curRoot, { fit: false });
  });
  document.getElementById('tg-amount').addEventListener('click', e => {
    SHOW_AMOUNT = !SHOW_AMOUNT;
    e.currentTarget.classList.toggle('on', SHOW_AMOUNT);
    world.classList.toggle('noamt', !SHOW_AMOUNT);
  });
  document.getElementById('tg-2s').addEventListener('click', e => {
    ANCHOR_2S = !ANCHOR_2S;
    e.currentTarget.classList.toggle('on', ANCHOR_2S);
    render(curRoot, { fit: false });
  });
  /* ---------------- 启动 ---------------- */
  contours();
  render(D.defaultRoot);          // 先把默认链路准备好，切过去时立即可用
  apply();
  showCodex();                    // 首屏 = 物品图鉴
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && view === 'codex') codex.scrollTop = 0;
  });
})();
