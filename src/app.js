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
  // 息壤环境用绿：跟「息壤」这件物品自己的稀有度色一致，也和稳定（蓝）/ 湿润（青）/
  // 酸性（橙）拉开差异。原先给的是紫，那是晶体的颜色，不是息壤的颜色。
  const ENV_COL = { stable: '#31a7e0', humid: '#35c6d6', acidic: '#e8a32c', xiranite: '#6dd04a' };
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
  // 气体散布机：实际耗时随输入流速在 2~10 秒之间浮动，数据集里只存了 10 秒这个上限
  const GAS_DIFFUSER = 'item_port_vaporizer_1';
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

  /* ---------------- 本地持久化 ----------------
     localStorage 存：挂起的产线、边栏收起态、用户自定义默认配方（仅覆盖增量；
     可采集物品眼睛的开合也记在这里）、图鉴筛选。键内带数据集版本，数据集重抓后
     旧状态自动作废；隐私模式等不可用场景退化为仅内存。 */
  const STORE_KEY = 'endfield_chain_ui_v1';
  const store = (() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (d && d.v === D.v) return d;
    } catch (e) {}
    return {};
  })();
  function saveStore() {
    store.v = D.v;
    store.pinned = pinned.slice();
    store.fold = dock.classList.contains('fold');
    store.defaults = {};
    userSet.forEach(id => { store.defaults[id] = overrides[id]; });
    store.cxFilter = cxFilter;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  const overrides = Object.assign({}, D.defaults, (() => {
    const kept = {};
    for (const id in store.defaults) {
      const rid = store.defaults[id];
      if (REC[rid] && REC[rid].outs.some(o => o.i === id)) kept[id] = rid;
    }
    return kept;
  })());
  const openDups = new Set(), openAlt = new Set(),
        userSet = new Set(Object.keys(store.defaults || {}));

  /* ---------------- 视图状态 ---------------- */
  let curRoot = D.defaultRoot;
  let k = 1, tx = 0, ty = 0;
  let SHOW_AMOUNT = true, ANCHOR_2S = false;
  // 锚定窗口（秒）：整条链路折算所对齐的那段时间。默认是「主体一次制造」的耗时，
  // 勾了「按2秒计」就是 2 秒。胶囊上的机器数 / 每次数由它和配方耗时算出来。
  let ANCHOR_W = 2;
  let view = 'chain';                 // 'chain' | 'codex'
  let nodes = [], worldW = 0, worldH = 0, CHIP_W = 196, SHOW_RATIO = true;

  const PAD_X = 60, PAD_TOP = 92, PAD_BOT = 66;   // 视口内留给顶栏 / 底栏的边距

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
      // 可采集资源（含植物/种子/天然气）在游戏里是链路端点：默认收成一只眼睛，点开才按
      // 当前选用配方展开。眼睛的开合就记在 userSet 里，与「设为默认配方」共用一个持久位。
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
    // 基准是主体「一次制造」：主体数量取该配方的单次产出量，于是胶囊读作「1 机器 × 各 1 次」，
    // 上游按这一炉的配比逐级折算（单次产出 2 个的配方不会退化成 ×0.5次）。
    // 「按2秒计」在这个基准上锚定时间 —— 整条链路数量统一乘 2 / 主体单次耗时，
    // 于是物品块角标读作「每 2 秒需要多少」，主体读作「每 2 秒产出多少」。
    const rootRec = pickRecipe(rootId);
    const rooted = rootRec && !ITEMS[rootId].g;
    ANCHOR_W = rooted ? (ANCHOR_2S ? 2 : rootRec.t) : 2;
    const scale = rooted ? outAmtOf(rootRec, rootId) * (ANCHOR_2S ? 2 / rootRec.t : 1) : 1;
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

  /* 计数读法：把「这条配方一共要跑多少次」拆成「几台机器 × 每台各跑几次」。
     单台机器在锚定窗口里最多跑 ANCHOR_W / t 次；总次数除以它是几台，向上取整
     （差一点也要多开一台），每台的次数就是总次数平摊回去 —— 于是机器数 × 各次
     数恒等于总次数，量守恒。 */
  function machineSplit(runs, t) {
    const perMachine = ANCHOR_W > 0 ? ANCHOR_W / t : 1;      // 单台在窗口内的产能
    const machines = Math.max(1, Math.ceil(runs / perMachine - 1e-9));
    return { machines, each: runs / machines };
  }

  function metrics(n) {
    if (n.recipe) {
      const r = n.recipe;
      n.r1w = 15 + 5 + textW(facName(r.fac), F_R1);
      if (r.req) n.r1w = Math.max(n.r1w, 14 + 5 + textW(envName(r.req), '700 11.5px ' + FF));
      const m = machineSplit(n.runs, r.t);
      n.machines = m.machines;
      n.r2text = `${m.machines}机器×各${trim(m.each)}次`;
      n.r2w = 10 + 4 + textW(n.r2text, F_R2);
      // 第三行写「单次配方」而不是把总需求再算一遍：物品块角标已经标了各级的总量，
      // 这里重复总数没有增量信息；同时把耗时从上一行挪下来，跟「秒/次」待在一起。
      const ins = r.ins.map(x => ({ n: itemName(x.i), a: trim(x.a) }));
      const outs = r.outs.map(x => ({ n: itemName(x.i), a: trim(x.a) }));
      const insH = ins.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ');
      const outsH = outs.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ');
      n.ratioText = ins.map(x => x.n + '×' + x.a).join(' + ') + ' → ' +
        outs.map(x => x.n + '×' + x.a).join(' + ') + ' · ' + trim(r.t) + '秒/次';
      n.ratioHTML = insH + ' <span class="ar">→</span> ' + outsH +
        ' <span class="ar">·</span> ' + trim(r.t) + '秒/次';
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

  /* 备选链路整组挂在金色胶囊（其他配方 / 收起）下面，而金色胶囊又悬在机具胶囊下方：
     主体中心往下 anchorH/2 + 29 才是胶囊下沿，备选机具顶上还有配方标签。
     配方行数少（胶囊矮）时这两者会正好叠在一起，所以主体中心到首条备选胶囊顶
     至少留 anchorH/2 + 29 + 8 + 标签高度，不够的部分补成组间留白。 */
  /* 金色胶囊挂在节点下方：物品块以节点中心对齐、机具胶囊也以中心对齐，谁的下沿
     更低就跟着谁 —— 只按 anchorH 算的话，物品块比机具胶囊高时（链路主体的块
     就高 23px）胶囊会压进块里。 */
  const pillDrop = n => Math.max(n.anchorH, tileH(n)) / 2 + 7;
  const PILL_DROP = 29;      // 金色胶囊下沿（相对节点中心）= 上式的 +7 再加胶囊高 22
  const PILL_PAD = 8;        // 胶囊与备选标签之间的呼吸位
  const PILL_H = 22;               // 与 CSS 里 .pill 的高度一致
  const padExtra = new Map();      // 摆完后按实际位置补的额外间距，键是节点 path

  function altPad(n) {
    const alt = n.alt && n.alt[0];
    if (!alt) return 0;
    let mid;                                   // 主体中心相对栈顶的偏移
    if (n.children.length) {
      const at = i => { let a = 0; for (let j = 0; j < i; j++) a += n.children[j].span + GAP_ROW; return a + n.children[i].span / 2; };
      mid = (at(0) + at(n.children.length - 1)) / 2;
    } else {
      mid = n.childSpan / 2;                   // 端点：主体在自己的盒子里居中
    }
    const dist = mid + GAP_ROW + (alt.span - alt.chipH) / 2;
    return Math.max(0, Math.max(n.anchorH, tileH(n)) / 2 + PILL_DROP + PILL_PAD +
      (alt.recipe.req ? 30 : 23) - dist) + (padExtra.get(n.path) || 0);
  }

  /* 上面那个间距是估算式，主体块比机具胶囊高 23px 时会差几个像素。摆完之后按实际
     位置量一次「胶囊下沿 ↔ 首条备选标签上沿」，不够就把差额补进去重排。
     只对有上游子节点的格子补：它们的物品块位置由子节点决定，补间距只会把备选往下推，
     一定收敛；端点格子的物品块位置随自身高度变化，补间距会连它一起推走，越补越大。 */
  function growAltPads(n) {
    let grew = false;
    if (n.alt && n.alt[0] && n.children.length) {
      const alt = n.alt[0];
      const short = PILL_PAD - ((alt.y - alt.chipH / 2 - tabOffset(alt)) - (n.y + pillDrop(n) + PILL_H));
      if (short > 0.5) { padExtra.set(n.path, (padExtra.get(n.path) || 0) + short); grew = true; }
    }
    n.stack.forEach(c => { if (growAltPads(c)) grew = true; });
    return grew;
  }

  /* 链路主体的物品块在 CSS 里比普通块高 23px（.tile.root 要放下「链路主体」标签），
     布局得按这个实际高度算：物品块以节点中心对齐、金色胶囊从块的下沿再往下 7px，
     若还按普通块的 68px 算，胶囊就会压进主体块里。 */
  const ROOT_EXTRA = 23;
  const tileH = n => TILE_H + (n.path === 'R:' + curRoot ? ROOT_EXTRA : 0);

  function spans(n) {
    n.chipH = 0;
    if (n.recipe) {
      const lines = SHOW_RATIO ? wrapLines(n.ratioText, CHIP_W - 20) : 0;
      n.ratioLines = lines;
      n.chipH = (n.recipe.req ? 20 : 0) + 6 + 16 + 14 + (lines ? lines * 13 + 5 : 0) + 6;
    }
    n.anchorH = n.chipH || tileH(n);
    n.h = n.isBranch ? n.chipH : tileH(n);
    if (n.chipH) n.h = Math.max(n.h, n.chipH);
    // 眼睛关着的采集端点没有金色胶囊，也就不用给它留位置
    if (n.others && n.others.length && !(n.kind === 'gather' && !n.wasDup))
      n.h = Math.max(n.h, n.anchorH + (openAlt.has(n.path) ? 6 : 30));
    (n.stack || []).forEach(spans);
    let s = 0;
    for (const c of n.stack) s += c.span + GAP_ROW;
    n.childSpan = n.stack.length ? s - GAP_ROW : 0;
    n.altGap = altPad(n);
    n.childSpan += n.altGap;
    n.span = Math.max(n.h, n.childSpan);
  }

  /* ---------------- 布局 ---------------- */
  function place(n, yTop) {
    let cy = yTop + (n.span - n.childSpan) / 2;
    for (let i = 0; i < n.stack.length; i++) {
      const c = n.stack[i];
      if (i && c.isBranch && !n.stack[i - 1].isBranch) cy += n.altGap;   // 首条备选：让开金色胶囊
      place(c, cy);
      cy += c.span + GAP_ROW;
    }
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
    // opts.focus：这次重排后要把视角挪到哪 —— 展开取 { path, mode:'top' }，收起取 { mode:'center' }
    const focus = opts.focus || null;
    const focusAt = (focus && focus.path && root) ? screenAt(focus.path) : null;
    curRoot = rootId;
    COLS.length = 0;
    root = build(rootId);
    metrics(root);
    CHIP_W = calcChipWidth(root);
    COLS.length = 0;
    padExtra.clear();
    spans(root);
    place(root, 0);
    for (let i = 0; i < 6 && growAltPads(root); i++) { spans(root); place(root, 0); }
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
    else if (focus) focusView(focus, focusAt);
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
      if (n.kind === 'dup' || eyeOnly(n)) continue;   // 上游已展示过：不画机具胶囊，也就没有连线
      const chipL = n.chipX - CHIP_W / 2, chipR = n.chipX + CHIP_W / 2;
      // 金色胶囊的引导线
      if (n.others && n.others.length) {
        const open = openAlt.has(n.path);
        const w = pillW(open ? '收起' : '其他配方', !open);
        // 引导线只在「胶囊与机具分离」时有意义；端点节点的胶囊就贴在物品块下方，不画
        if (n.recipe) out.push(lead(chipL, n.y + pillDrop(n), w, n.y + n.chipH / 2));
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
  // 机具胶囊上方是否挂着配方标签（「默认配方」/「设为默认配方」）
  function hasTab(n) {
    if (!n.recipe) return false;
    if (n.isBranch) return true;
    return !!(n.others && n.others.length && openAlt.has(n.path));
  }
  // 上游已经展示过这件物品（重复 / 环路）：整格收成一个眼睛按钮，
  // 左侧那条机具胶囊是同一台机具的同一份配方，再画一遍只是噪音
  function eyeOnly(n) { return !!n.wasDup && !openDups.has(n.path); }
  // 可采集物品的配方入口：物品块左缘那只眼睛。关＝空配方端点，金色胶囊不出现；
  // 开＝按当前选用配方展开成正常机具格。开合状态即 userSet，与「设为默认配方」同一位。
  function hasGatherEye(n) {
    return !n.isBranch && !n.wasDup && n.kind !== 'loop' && n.item.g &&
      !!(n.recipe || (n.others && n.others.length));
  }
  // 标签相对胶囊顶边的偏移：普通胶囊保留 7px 的嵌入感；带环境色带的胶囊顶部那 20px
  // 是色带，再压上去就会把色带切掉一块，所以整块抬到胶囊顶边之上（30 = 标签高度）
  function tabOffset(n) {
    if (!hasTab(n)) return 0;
    return n.recipe.req ? 30 : 23;
  }

  function drawNodes() {
    const h = [];
    const iconURL = id => ICON.items[id] || PH;
    for (const n of nodes) {
      const fam = { c: tierColor(n.item.tier) };
      const isRoot = n.path === 'R:' + curRoot;

      if (n.wasDup) {
        const open = openDups.has(n.path);
        // 眼睛嵌在物品块左边缘上：横向压进块内半个身位（22 宽 → 11），纵向与块同中心
        h.push(`<div class="eye${open ? ' open' : ''}" data-act="eye" data-path="${esc(n.path)}" ` +
          `style="left:${n.x - TILE_W / 2 - 11}px;top:${n.y - 11}px">` +
          eyeSVG() + `</div>`);
      } else if (hasGatherEye(n)) {
        // 同一只眼睛复用在采集端点上：开＝显示配方（持久），关＝收回端点
        h.push(`<div class="eye${userSet.has(n.itemId) ? ' open' : ''}" data-act="eye" data-path="${esc(n.path)}" ` +
          `style="left:${n.x - TILE_W / 2 - 11}px;top:${n.y - 11}px">` +
          eyeSVG() + `</div>`);
      }

      if (!n.isBranch) {
        const label = isRoot ? `<div class="tag-sub">链路主体</div>` : `<div class="btn">切换链路 ›</div>`;
        h.push(`<div class="tile${n.kind === 'dup' ? ' isdup' : ''}${isRoot ? ' root' : ''}" data-item="${esc(n.itemId)}" data-path="${esc(n.path)}" ` +
          `style="left:${n.x - TILE_W / 2}px;top:${n.y - tileH(n) / 2}px;--fam:${fam.c};--fam-dark:${famDark(fam.c)}">` +
          `<div class="thumb"><div class="ruler"></div><img src="${iconURL(n.itemId)}" alt=""><div class="bar"></div></div>` +
          `<div class="hatch2"></div><div class="dots"></div>` +
          `<div class="amt${n.recipe ? '' : ' raw'}">×${trim(n.amount)}</div>` +
          `<div class="actions">${label}</div></div>`);
      }

      if (!n.recipe || eyeOnly(n)) continue;         // 上游已展示过：只留眼睛与物品块，机具胶囊整个收起
      const r = n.recipe;
      const chipH = n.chipH;
      const lines = n.ratioLines || 0;
      h.push(`<div class="chip${n.isBranch ? ' altchip' : ''}${r.req ? ' hasenv' : ''}${hasTab(n) ? ' hastab' : ''}" data-path="${esc(n.path)}" ` +
        `style="left:${n.chipX - CHIP_W / 2}px;top:${n.y - chipH / 2}px;width:${CHIP_W}px;height:${chipH}px">` +
        (r.req ? `<div class="envband" style="background:${envCol(r.req)}">` +
          envGlyph(r.req) + `<span>${esc(envName(r.req))}</span></div>` : '') +
        `<div class="body">` +
        `<div class="r1"><svg viewBox="0 0 24 24"><path d="${FACGLYPH(r.fac)}" fill="#fff" fill-rule="evenodd"/></svg>` +
        `<span>${esc(facName(r.fac))}</span></div>` +
        `<div class="r2">${clockSVG()}<span>${esc(n.r2text)}</span></div>` +
        (SHOW_RATIO ? `<div class="r3" style="height:${lines * 13 + 3}px">${n.ratioHTML}</div>` : '') +
        `</div></div>`);
    }
    // 标签与胶囊（端点节点也可能带配方入口）
    for (const n of nodes) {
      if (n.kind === 'dup' || eyeOnly(n)) continue;   // 已经收成眼睛的节点没有胶囊，也就没有标签
      if (!n.recipe) {
        if (!hasGatherEye(n) && n.others && n.others.length) {
          const open = openAlt.has(n.path);
          const w = pillW(open ? '收起' : '其他配方', !open);
          h.push(`<div class="pill" data-act="alt" data-path="${esc(n.path)}" ` +
            `style="left:${Math.round(n.x - w / 2)}px;top:${n.y + pillDrop(n)}px;width:${Math.round(w)}px;justify-content:center">` +
            `<span>${open ? '收起' : '其他配方'}</span>` +
            (open ? chevUpSVG() : swapSVG() + `<span class="cnt">${n.others.length}</span>`) + `</div>`);
        }
        continue;
      }
      const r = n.recipe;
      const showDefaultTab = !n.isBranch && hasTab(n);
      if (n.isBranch || showDefaultTab) {
        const isDefault = !n.isBranch;
        h.push(`<div class="tab${isDefault ? ' on' : ' clickable'}"${isDefault ? '' : ` data-act="setdef" data-item="${esc(n.itemId)}" data-rid="${esc(r.id)}" data-path="${esc(n.path)}"`} ` +
          `style="left:${n.chipX - CHIP_W / 2}px;top:${n.y - n.chipH / 2 - tabOffset(n)}px;width:${CHIP_W}px;height:30px">` +
          `<span>${isDefault ? '默认配方' : '设为默认配方'}</span><span class="radio"></span></div>`);
      }
      if (n.others && n.others.length) {
        const open = openAlt.has(n.path);
        const w = pillW(open ? '收起' : '其他配方', !open);
        h.push(`<div class="pill" data-act="alt" data-path="${esc(n.path)}" ` +
          `style="left:${n.chipX - CHIP_W / 2}px;top:${n.y + pillDrop(n)}px;width:${Math.round(w)}px;justify-content:space-between">` +
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
    stopPan();
    const r = stage.getBoundingClientRect();
    const kk = Math.min((r.width - PAD_X * 2) / Math.max(worldW, 1), (r.height - PAD_TOP - PAD_BOT) / Math.max(worldH, 1));
    k = Math.max(.15, Math.min(kk, 1.3));
    tx = Math.max(30, (r.width - worldW * k) / 2);
    ty = PAD_TOP;
    apply();
  }
  function zoomAt(cx, cy, nk) {
    stopPan();
    nk = Math.max(.15, Math.min(2.6, nk));
    const wx = (cx - tx) / k, wy = (cy - ty) / k;
    k = nk; tx = cx - wx * k; ty = cy - wy * k;
    apply();
  }
  /* 这一格在屏幕上的横向锚点：有机具胶囊的对准胶囊，端点节点没有胶囊、对准物品块。
     胶囊的摆放本来就是这个口径（drawNodes 里端点用 n.x、其余用 n.chipX），
     screenAt 与 focusView 必须跟着同口径 —— 两个锚点相差半列宽，
     各取各的会让「摆回原位」补错量，整张图被横着推走。 */
  function anchorX(n) { return n.recipe ? n.chipX : n.x; }
  // 这一格当前在屏幕上的位置（重排前记下来，重排后先照原样摆回去，再缓动到目标）
  function screenAt(path) {
    const n = nodes.find(z => z.path === path);
    return n ? { x: anchorX(n) * k + tx, y: n.y * k + ty } : null;
  }

  /* 视角平移：用 rAF 缓动，避免瞬移；拖动、缩放、下一次聚焦都会打断它 */
  let panRAF = 0, panTimer = 0;
  function stopPan() {
    if (panRAF) { cancelAnimationFrame(panRAF); panRAF = 0; }
    if (panTimer) { clearTimeout(panTimer); panTimer = 0; }
  }
  function panTo(nx, ny, ms) {
    stopPan();
    const x0 = tx, y0 = ty, t0 = performance.now();
    const dur = ms || 400;
    // 标签页切到后台时浏览器不再派动画帧，兜底把视角直接放到目标位置，
    // 免得「展开 / 收起」之后画面停在原地、内容却已经变了
    panTimer = setTimeout(() => {
      panTimer = 0;
      if (!panRAF) return;
      cancelAnimationFrame(panRAF); panRAF = 0;
      tx = nx; ty = ny; apply();
    }, dur + 300);
    const step = now => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const e = 1 - Math.pow(1 - p, 3);        // ease-out：起步快、收尾稳
      tx = x0 + (nx - x0) * e;
      ty = y0 + (ny - y0) * e;
      apply();
      panRAF = p < 1 ? requestAnimationFrame(step) : 0;
    };
    panRAF = requestAnimationFrame(step);
  }

  /* 展开「其他配方」：把这条配方（备选组里的第一条）顶到屏幕上方，新铺开的分支正好落进视野；
     收起：这条配方纵向回到屏幕正中（链路缩小后不至于把刚操作的那一格甩到视野外）。
     两者都只平移、不缩放，横向都不动 —— 世界原点 ox 会随内容宽窄变化，若只补纵向、
     不动横向，整张图就会顺着收缩量横移，收得越多挪得越远。
     重排是瞬间完成的（DOM 已经是新布局），所以首帧必须先把这一格摆回它点击前的屏幕
     位置，否则点下去会先跳一下、再被缓动拉回来；随后只对纵向做缓动。 */
  function focusView(focus, from) {
    const r = stage.getBoundingClientRect();
    const n = nodes.find(z => z.path === focus.path);
    if (!n) return;
    let ny;
    if (focus.mode === 'center') {
      ny = PAD_TOP + (r.height - PAD_TOP - PAD_BOT) / 2 - n.y * k;
    } else {
      // 置顶的是「这条配方」本身：有机具胶囊的节点就是它的胶囊（连上方标签）；
      // 端点节点没有胶囊，展开后顶上第一格才是它的第一条备选配方，取那一格 ——
      // 端点的物品图标排在更下面，不该占着置顶位。
      const lead = (!n.recipe && n.alt[0]) ? n.alt[0] : n;
      const top = Math.min(lead.y - Math.max(lead.h, lead.chipH) / 2,
        lead.recipe ? lead.y - lead.chipH / 2 - tabOffset(lead) : Infinity);
      ny = PAD_TOP - top * k;
    }
    if (!from) { panTo(tx, ny); return; }
    // 起点：新布局下把这一格放回原处；横向随之恒定，缓动只走纵向
    tx = from.x - anchorX(n) * k;
    ty = from.y - n.y * k;
    apply();
    panTo(tx, ny);
  }

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
    zoomAt(e.clientX - r.left, e.clientY - r.top, k * Math.exp(-dy * 0.0014));
  }, { passive: false });

  // 注意：不要在 stage 上 setPointerCapture —— 指针捕获会把后续鼠标事件一并重定向到
  // 捕获元素，画布内的物品块/机具胶囊就再也收不到 click。改为窗口级监听。
  const DRAG_SLOP = 5;             // 位移超过它就算「拖动」，不再算「点击」
  let drag = null, swallowClick = false;
  stage.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    stopPan();
    swallowClick = false;
    drag = {
      x: e.clientX, y: e.clientY, tx, ty, moved: 0,
      onNode: !!e.target.closest('.tile, .chip, .pill, .eye, .tab'),
    };
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved >= DRAG_SLOP) stage.classList.add('dragging');
    tx = drag.tx + dx; ty = drag.ty + dy;
    apply();
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    stage.classList.remove('dragging');
    // 画布被拖走了：这次手势是平移，抬手后浏览器补发的那一下 click 必须丢掉。
    // 否则在物品块 / 机具胶囊上起手的拖动会顺带触发它们的点击（切换链路、开详情…）
    if (d.moved >= DRAG_SLOP) swallowClick = true;
    else if (!d.onNode) selectNode(null);
  });
  addEventListener('pointercancel', () => { drag = null; swallowClick = false; stage.classList.remove('dragging'); });

  /* ---------------- 交互 ---------------- */
  nodeLayer.addEventListener('click', e => {
    if (swallowClick) { swallowClick = false; return; }   // 这一次是拖动画布，不是点节点
    const eye = e.target.closest('.eye');
    if (eye) {
      const p = eye.dataset.path;
      const n = nodes.find(z => z.path === p);
      if (n && hasGatherEye(n)) {
        // 采集端点的眼睛：开＝显示当前选用配方并持久保存，关＝收回空配方端点。
        // 同一物品在链路里出现多处时，重排后只有首行成为主体、其余收成重复眼睛：
        // 先清空这一物品的所有展开痕迹，再单独记住点击行 —— 从哪行点开都是首行与当前行一起睁开。
        const opening = !userSet.has(n.itemId);
        if (opening) userSet.add(n.itemId); else userSet.delete(n.itemId);
        nodes.forEach(z => {
          if (z.itemId === n.itemId) { openDups.delete(z.path); openAlt.delete(z.path); }
        });
        if (opening) openDups.add(p);
        saveStore();
      } else {
        openDups.has(p) ? openDups.delete(p) : openDups.add(p);
      }
      render(curRoot, { fit: false }); return;
    }
    const pill = e.target.closest('.pill');
    if (pill) {
      const p = pill.dataset.path;
      const opening = !openAlt.has(p);
      if (opening) openAlt.add(p); else openAlt.delete(p);
      // 展开：把这条配方顶到屏幕上方，好让备选链路整组落进视野；收起：它自己纵向回到屏幕正中
      render(curRoot, { fit: false, focus: { path: p, mode: opening ? 'top' : 'center' } });
      return;
    }
    const tab = e.target.closest('.tab.clickable');
    if (tab) {
      overrides[tab.dataset.item] = tab.dataset.rid;
      userSet.add(tab.dataset.item);
      // 备选组展开只为挑选：选完默认配方就整组收起，视角对准这一格（与「收起」胶囊同款）
      const owner = tab.dataset.path.slice(0, tab.dataset.path.lastIndexOf('~'));
      openAlt.delete(owner);
      saveStore();
      render(curRoot, { fit: false, focus: { path: owner, mode: 'center' } });
      toast('已将「' + facName(REC[tab.dataset.rid].fac) + '」设为 ' + itemName(tab.dataset.item) + ' 的默认配方');
      const n = nodes.find(z => z.itemId === tab.dataset.item && z.recipe);
      if (n) openPanel(n);
      return;
    }
    const btn = e.target.closest('.tile .btn');
    if (btn) {
      routeTo(btn.closest('.tile').dataset.item);
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
      const m = machineSplit(n.runs, n.recipe.t);
      H.push(`<div class="kv"><span class="k">计法</span><span class="v"><em>${m.machines}</em> 台机器 × 各 <em>${trim(m.each)}</em> 次 · ${trim(n.recipe.t)} 秒/次</span></div>`);
      H.push(`<div class="kv"><span class="k">机具</span><span class="v">${esc(facName(n.recipe.fac))}</span></div>`);
      // 环境要求直接跟在机具后面成一行：它跟机具一样是这条配方的属性，
      // 单开一节只放一行「环境」反而多一层层级
      if (n.recipe.req) {
        const src = ENV.find(x => x.env === n.recipe.req);
        H.push(`<div class="kv"><span class="k">环境</span><span class="v">` +
          `<em style="color:${envCol(n.recipe.req)}">${esc(envName(n.recipe.req))}</em>` +
          (src ? `　由 ${esc(facName(src.fac))} 提供` : '') + `</span></div>`);
      }
    } else {
      H.push(`<div class="kv"><span class="k">来源</span><span class="v">${n.kind === 'loop' ? '循环依赖' : '基础资源 / 采集'}</span></div>`);
    }
    H.push('</div>');

    if (n.recipe && n.recipe.env) {
      H.push(`<div class="sect"><h4>产出环境</h4><div class="kv"><span class="k">环境</span><span class="v">` +
        `<em style="color:${envCol(n.recipe.env)}">${esc(envName(n.recipe.env))}</em>　不产出物品，供同区域机具使用</span></div></div>`);
    }
    if (n.recipe) {
      const r = n.recipe, p = ratioParts(n);
      H.push(`<div class="sect"><h4>配方比例</h4><div class="ratio-box">` +
        p.ins.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ') +
        ` <span class="ar">→</span> ` +
        p.outs.map(x => `<b>${esc(x.n)}</b>×${x.a}`).join(' <span class="ar">+</span> ') +
        `<br><span class="one">单次配方 ${trim(r.t)}秒/次</span><br>` +
        `<span class="one">` + esc(r.ins.map(x => itemName(x.i) + '×' + x.a).join(' + ')) + ' → ' +
        esc(r.outs.map(x => itemName(x.i) + '×' + x.a).join(' + ')) + `</span>` +
        `</div></div>`);
    }

    const others = BYOUT[n.itemId] || [];
    if (others.length) {
      H.push(`<div class="sect"><h4>可选配方（${others.length}）</h4>`);
      others.forEach(r => {
        const cur = n.recipe && r.id === n.recipe.id;
        H.push(`<div class="rec${cur ? ' cur' : ''}" data-act="setdef" data-item="${esc(n.itemId)}" data-rid="${esc(r.id)}">` +
          `<span class="dot2"></span><div style="flex:1">` +
          `<span class="fac">${esc(facName(r.fac))}</span> <span class="sub">${trim(r.t)} 秒</span>` +
          (r.req ? `<span class="env" style="background:${envCol(r.req)}">` +
            envGlyph(r.req) + `${esc(envName(r.req))}</span>` : '') +
          `<br>` +
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
    // 无产出的配方：这件物品的「销毁 / 供能 / 供环境」去向。电池这类物品在整个数据集里
    // 只有这一条用途，发电功率是这里信息量最大的数字，但它只存在于配方数据里，
    // 物品块、链路图都看不到，所以必须在这栏点出来。
    const envUse = ENV.filter(r => r.ins.some(x => x.i === n.itemId));
    if (envUse.length) {
      H.push(`<div class="sect"><h4>其他用途</h4><div class="hintline">` +
        envUse.map(r => {
          const amt = trim(r.ins.reduce((s, x) => s + x.a, 0));
          const secs = r.fac === GAS_DIFFUSER ? '2~10秒' : trim(r.t) + '秒';
          let out;
          if (r.pw) out = `发电 ${r.pw}W`;
          else if (r.env) out = `在一定范围内维持<span class="envname" style="color:${envCol(r.env)}">` +
            esc(envName(r.env)) + `</span>`;
          else out = '无产出';
          return `<div class="use"><b>${esc(facName(r.fac))}</b> ${secs} 消耗 ${amt} 单位<br>${out}</div>`;
        }).join('') + `</div></div>`);
    }
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
      saveStore();
      const keep = panelPath;
      render(curRoot, { fit: false });
      const n = nodes.find(z => z.path === keep) || nodes.find(z => z.itemId === def.dataset.item && z.recipe);
      if (n) openPanel(n);
      return;
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) { routeTo(jump.dataset.jump); return; }
  });

  /* ---------------- Hash 路由 ----------------
     #/          → 物品图鉴（主页面）
     #/<物品id>  → 该物品的制造链路子页，不同物品的子页 id 不同，
     前进 / 后退 / 刷新 / 分享链接都由浏览器历史原生接管。 */
  let navDepth = 0;                   // 应用内压入的历史层数（直链进入时为 0）

  function parseRoute() {
    const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    return (id && ITEMS[id]) ? { view: 'chain', id } : { view: 'codex' };
  }
  function applyRoute() {
    const r = parseRoute();
    if (r.view === 'codex') { if (view !== 'codex') showCodex(); }
    else if (view === 'codex' || curRoot !== r.id) { render(r.id); selectNode(null); }
  }
  function routeTo(hash) {
    const target = '#/' + hash;
    if (location.hash !== target) {
      navDepth++;
      try { history.pushState({ d: navDepth }, '', target); }
      catch (e) { location.hash = target; }   // 极老内核禁用 pushState 时退化为 hash 导航
    }
    applyRoute();
  }
  addEventListener('popstate', () => {
    navDepth = (history.state && history.state.d) || 0;
    applyRoute();
  });
  addEventListener('hashchange', applyRoute); // 手改地址栏 / 退化路径时补一次路由

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
    renderDock();
  }

  /* ---------------- 物品图鉴 ---------------- */
  const codex = document.getElementById('codex');
  const cxHead = document.querySelector('#codex .cx-head');
  const cxGrid = document.getElementById('cx-grid');
  const cxBar = document.getElementById('cx-bar');
  let cxFilter = (store.cxFilter === 'all' || FAM[store.cxFilter]) ? store.cxFilter : 'all';

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
    saveStore();
  });
  cxGrid.addEventListener('click', e => {
    const c = e.target.closest('.cx-card');
    if (c) routeTo(c.dataset.id);
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
    routeTo(id);
    results.classList.remove('on');
    search.value = ''; search.blur();
  }
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#results') && !e.target.closest('#searchwrap')) results.classList.remove('on');
  });
  document.getElementById('crumb-home').addEventListener('click', () => routeTo(''));
  document.getElementById('crumb-home-pill').addEventListener('click', () => routeTo(''));
  document.getElementById('crumb-codex').addEventListener('click', () => routeTo(''));

  /* ---------------- 挂起边栏（dock） ----------------
     把当前产线（主物品）挂起到屏幕左缘的白面板上；每条挂起项按游戏配方条的
     样子渲染：使用 <机具> [环境] 头部 + 输入块 → 耗时▶▶ → 产出块。
     收起时整条滑出屏幕、左缘留一个细条；仅存于本次会话内存。 */
  const dock = document.getElementById('dock');
  const dockTab = document.getElementById('dock-tab');
  const dockList = document.getElementById('dock-list');
  const dockEmpty = document.getElementById('dock-empty');
  const pinBtn = document.getElementById('pinbtn');
  const pinned = (store.pinned || []).filter(id => ITEMS[id]);   // 挂起的物品 id，按挂起顺序
  if (store.fold) dock.classList.add('fold');

  function syncDockFold() {
    dockTab.classList.toggle('closed', dock.classList.contains('fold'));
  }
  function syncPinBtn() {
    const on = view === 'chain' && pinned.includes(curRoot);
    pinBtn.classList.toggle('on', on);
    pinBtn.title = on ? '取消挂起当前产线' : '挂起当前产线';
  }
  function dkTile(iid, a) {
    const t = ITEMS[iid], c = tierColor(t.tier);
    return `<div class="dk-tile" style="--fam-dark:${famDark(c)}" title="${esc(t.zh)} · T${t.tier || 1}">` +
      `<img src="${ICON.items[iid] || PH}" alt="">` +
      (a !== undefined ? `<span class="dk-q">${trim(a)}</span>` : '') +
      `<i style="background:${c}"></i></div>`;
  }
  function renderDock() {
    dock.style.display = '';          // 空态也显示面板，用于展示挂起指引
    dockEmpty.style.display = pinned.length ? 'none' : '';
    dockList.style.display = pinned.length ? '' : 'none';
    syncDockFold();
    dockList.innerHTML = pinned.map(id => {
      const it = ITEMS[id];
      const r = overrides[id] ? REC[overrides[id]] : null;
      const act = view === 'chain' && id === curRoot;
      let head, flow;
      if (r) {
        head = `<div class="dk-use">使用` +
          `<span class="dk-b fac" title="${esc(facName(r.fac))}"><svg viewBox="0 0 24 24"><path d="${FACGLYPH(r.fac)}"/></svg></span>${esc(facName(r.fac))}` +
          (r.req ? `<span class="dk-b env" style="background:${envCol(r.req)}" title="需要${esc(envName(r.req))}">` +
            `<svg viewBox="0 0 24 24"><path d="${ENV_ICON[r.req] || ENV_ICON.stable}"/></svg></span>` : '') +
          `</div>`;
        flow = `<div class="dk-flow">` +
          `<div class="dk-grp ins">${r.ins.map(x => dkTile(x.i, x.a)).join('')}</div>` +
          `<span class="dk-go"><b>${trim(r.t)}秒</b>` +
          `<svg viewBox="0 0 28 16"><path d="M2 1.5 12.5 8 2 14.5ZM15.5 1.5 26 8 15.5 14.5Z"/></svg></span>` +
          `<div class="dk-grp outs">${r.outs.map(x => dkTile(x.i, x.a)).join('')}</div>` +
          `</div>`;
      } else {
        head = `<div class="dk-use">基础资源 · 采集获得</div>`;
        flow = `<div class="dk-flow"><div class="dk-grp ins">${dkTile(id)}</div></div>`;
      }
      return `<div class="dk-card${act ? ' act' : ''}" data-id="${esc(id)}" title="跳到「${esc(it.zh)}」的产线">` +
        `<div class="dk-x" data-unpin="${esc(id)}" title="取消挂起">✕</div>` +
        head + flow + `</div>`;
    }).join('');
    syncPinBtn();
  }
  pinBtn.addEventListener('click', () => {
    if (view !== 'chain') return;
    const i = pinned.indexOf(curRoot);
    if (i >= 0) { pinned.splice(i, 1); toast('已取消挂起「' + itemName(curRoot) + '」'); }
    else { pinned.push(curRoot); toast('已把「' + itemName(curRoot) + '」挂起到左侧边栏'); }
    renderDock();
    saveStore();
  });
  dockList.addEventListener('click', e => {
    const x = e.target.closest('[data-unpin]');
    if (x) {
      const i = pinned.indexOf(x.dataset.unpin);
      if (i >= 0) pinned.splice(i, 1);
      renderDock();
      saveStore();
      return;
    }
    const t = e.target.closest('.dk-card');
    if (t) routeTo(t.dataset.id);
  });
  /* 让位动画（FLIP）：#codex 的 padding-left 在动画起点一次性落定，物品网格只重排
     一次（为什么不在 padding 上做过渡，见 style.css 里 #codex 的注释）；200ms 的
     滑动手感由 transform 补出来 —— .cx-head / .cx-grid 先瞬移回旧的视觉位置，再
     过渡到 0，与 #dock 的滑入/滑出同步。纯合成器动画：物品再多，动画期间每帧都
     不再重排重绘。动画中再次点击时按当前视觉位置无缝接续。 */
  const CX_DOCK_W = 360;                        // 与 #dock 宽度 / #codex 让位宽度一致
  let cxSlideGen = 0;                           // 动画代数：被新点击接手时，旧收尾作废
  function cxSlide(folding) {
    if (view !== 'codex') return;
    const m = getComputedStyle(cxGrid).transform;
    const cur = (m && m !== 'none') ? new DOMMatrixReadOnly(m).m41 : 0;
    const start = cur + (folding ? CX_DOCK_W : -CX_DOCK_W);   // 相对新布局的视觉偏移
    const els = [cxHead, cxGrid];
    const gen = ++cxSlideGen;
    codex.classList.add('cx-anim');
    els.forEach(el => {
      el.style.transition = 'none';
      el.style.transform = `translateX(${start}px)`;
      el.style.willChange = 'transform';
    });
    cxGrid.getBoundingClientRect();             // 强制一次布局，把起始帧提交上去
    els.forEach(el => {
      el.style.transition = 'transform .2s ease';   // 缓动与 #dock 一致
      el.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      if (gen !== cxSlideGen) return;
      els.forEach(el => { el.style.transition = el.style.transform = el.style.willChange = ''; });
      codex.classList.remove('cx-anim');
    }, 240);
  }
  dockTab.addEventListener('click', () => {
    const folding = !dock.classList.contains('fold');
    dock.classList.toggle('fold', folding);
    syncDockFold();
    cxSlide(folding);
    saveStore();
  });

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
        // 内圈高光与机具胶囊同族，气泡与链路上的深色胶囊看起来是一套东西
        'padding:7px 16px;border-radius:999px;' +
        'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.16),0 6px 18px rgba(0,0,0,.35);opacity:0;' +
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
  navDepth = (history.state && history.state.d) || 0;
  const first = parseRoute();
  if (first.view === 'codex') {
    render(D.defaultRoot);          // 先把默认链路准备好，垫在图鉴下立即可用
    apply();
    showCodex();                    // 首屏 = 物品图鉴
  } else {
    render(first.id);               // #/<物品id> 直链：直接落子页
  }
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && view === 'codex') codex.scrollTop = 0;
  });
})();
