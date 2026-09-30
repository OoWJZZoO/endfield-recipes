/* 机具图标：原生 UI 风格的单色白描 glyph（24x24，evenodd 挖空） */
(function () {
  const FRAME = 'M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z';

  // 每个 glyph = [是否带外框, 符号路径...]（符号在 evenodd 下成为镂空）
  const DEF = {
    // 粉碎机：料斗 + 落料口
    grinder: [1, 'M7 6h10l-3.4 4.6V17h-3.2v-6.4z'],
    // 精炼炉：炉膛 + 火焰
    furnance: [1, 'M12 5.6c-3 3.9-3.7 6.3-2.1 8.5.8 1.1 2 1.7 2.1 2.5.1-.8 1.3-1.4 2.1-2.5 1.6-2.2.9-4.6-2.1-8.5z'],
    // 反应池：罐体 + 搅拌桨
    mix_pool: [1, 'M11 5h2v5.2h-2zM7.5 10.6h9v2h-9zM8.5 14.4h7v1.8h-7z'],
    // 气体反应炉：腔体 + 闪电
    gas_reactor: [1, 'M13.4 5.6 7.4 13h3.4l-1.2 5.4L16.6 11h-3.4z'],
    // 提纯机：漏斗 + 滤芯
    purification: [1, 'M5.6 6h12.8l-5.2 5.6V18h-2.4v-6.4zM10.4 13.2h3.2v2.2h-3.2z'],
    // 水处理机：三道水波
    water_treatment: [1,
      'M6 7.4c1.6-1.7 3.2-1.7 4.8 0s3.2 1.7 4.8 0l1.4 1.5c-2 2.1-4 2.1-6 0-2 2.1-4 2.1-6 0z',
      'M6 12.2c1.6-1.7 3.2-1.7 4.8 0s3.2 1.7 4.8 0l1.4 1.5c-2 2.1-4 2.1-6 0-2 2.1-4 2.1-6 0z',
      'M6 17c1.6-1.7 3.2-1.7 4.8 0s3.2 1.7 4.8 0l1.4 1.5c-2 2.1-4 2.1-6 0-2 2.1-4 2.1-6 0z'],
    // 液气转化机：液滴 ↹ 气团
    phase_trans_1: [1,
      'M9.4 5.4c-2.5 3.3-3.1 5.3-1.7 7 .7.9 1.6 1.3 1.7 1.9.1-.6 1-1 1.7-1.9 1.4-1.7.8-3.7-1.7-7z',
      'M16.4 10.6a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2zm0 8.4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z'],
    // 固气转化机：方块 ↹ 气团
    phase_trans_2: [1,
      'M8.6 6.4 12 8.3v3.8l-3.4 1.9-3.4-1.9V8.3z',
      'M16.6 11.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 8.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z'],
    // 种植机：育苗箱 + 嫩芽
    planter: [1, 'M11.1 17.4h1.8v-4.6h-1.8z',
      'M12 12.2c-.5-2.4-2.6-4-5-3.9.4 2.6 2.5 4.2 5 3.9z',
      'M12 12.2c.5-2.4 2.6-4 5-3.9-.4 2.6-2.5 4.2-5 3.9z'],
    // 采种机：箱体 + 花穗
    seedcol: [1, 'M11.1 17.6h1.8v-5.8h-1.8z',
      'M12 10.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
      'M8.6 8.8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
    // 配件机：齿轮
    cmpt_mc: [1,
      'M11.1 5.2h1.8v2.1h-1.8zM11.1 16.7h1.8v2.1h-1.8zM5.2 11.1h2.1v1.8H5.2zM16.7 11.1h2.1v1.8h-2.1z',
      'M6.6 6.6l1.3 1.3-1.3 1.3L5.3 7.9zM15.8 6.6l1.3 1.3-1.3 1.3-1.3-1.3zM6.6 15.8l1.3-1.3 1.3 1.3-1.3 1.3zM15.8 15.8l1.3-1.3 1.3 1.3-1.3 1.3z',
      'M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zm0 2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z'],
    // 封装机：包装箱 + 束带
    tools_asm: [1, 'M6.6 8.6h10.8v9H6.6zM11 5.6h2v3h-2z', 'M11.1 8.6h1.8v9h-1.8z'],
    // 塑形机：上下压板 + 坯料
    shaper: [1, 'M5.6 5.4h12.8v2.2H5.6zM5.6 16.4h12.8v2.2H5.6z', 'M8.4 9.6h7.2l1.2 2.4-1.2 2.4H8.4L7.2 12z'],
    // 灌装机：瓶身 + 注嘴
    filling: [1, 'M11 3.6h2v2.6h-2z', 'M10 6.8h4l.9 2.2v9.4H9.1V9z'],
    // 装备原件机：绕线筒 + 线材
    winder: [1,
      'M6.4 6.4h11.2v2H6.4zM6.4 15.6h11.2v2H6.4z',
      'M12 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2zm0 1.8a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
      'M6.8 9.4h2.4v5.2H6.8zM14.8 9.4h2.4v5.2h-2.4z'],
    // 浓缩机：罐体 + 浓度梯度
    thickener: [1, 'M5.6 6h12.8v2H5.6zM7.4 9.6h9.2v2H7.4zM9.2 13.2h5.6v2H9.2z', 'M6 16.4h12v2.4H6z'],
    // 蒸发机：釜体 + 上升蒸汽
    vaporizer: [1,
      'M6.6 13.6h10.8v6.8H6.6z',
      'M8.6 11.6c1.1-1.1 2.2-1.1 3.3 0s2.2 1.1 3.3 0l1.1 1.2c-1.5 1.5-3 1.5-4.4 0-1.5 1.5-3 1.5-4.4 0z',
      'M9.4 4.2c1.2-1.2 2.4-1.2 3.6 0s2.4 1.2 3.6 0l1.2 1.3c-1.6 1.6-3.2 1.6-4.8 0-1.6 1.6-3.2 1.6-4.8 0z'],
    // 拆解机：机箱 + 剪切刀口
    dismantler: [1, 'M6.4 6.4h11.2v3.4H6.4z', 'M11 9.8h2l-2.4 8.4h-2z', 'M13.6 9.8h2l2.2 8.4h-2z'],
    // 息壤窑：窑顶 + 火舌
    xiranite_oven: [1,
      'M6 12.4h12v8H6z',
      'M12 5.2a3 3 0 0 0-3 3v3.2h6V8.2a3 3 0 0 0-3-3z',
      'M10.2 9.2h1.4v2.4h-1.4zM12.4 9.2h1.4v2.4h-1.4z'],
    // 蓄热器：电池 + 热浪
    thermal_bank: [1, 'M8.4 5.6h7.2v13.6H8.4z', 'M10.4 8.4h3.2v2H10.4zm0 4h3.2v2h-3.2z'],
    // 便携源石矿机：钻头 + 支架
    portable_miner: [1, 'M5.6 13.6h12.8v6.4H5.6z', 'M11 4.6h2v7.4h-2z',
      'M7.6 6.4 11 9.6 9.6 11 6.2 7.8zM16.4 6.4 13 9.6l1.4 1.4 3.4-3.2z'],
    // 水泵：泵体 + 进出水管
    water_pump: [1, 'M9.4 9.4h5.2v5.2H9.4z', 'M4.6 11.1h4.8v1.8H4.6zM14.6 11.1h4.8v1.8h-4.8z',
      'M11.1 5.2h1.8v4.2h-1.8zM11.1 14.6h1.8v4.2h-1.8z'],
    // 采矿机：矿车 + 镐
    miner: [1, 'M4.6 13.6h11.2l1.6 6H3z', 'M8 7.4h1.8v6.2H8z', 'M6.6 6.2c1.8-2.6 5-3.4 7.6-2l-1 1.7c-2-1-4.2-.5-5.6 1.2z'],
    // 通用兜底：齿轮箱
    generic: [1, 'M11.1 5.4h1.8v13.2h-1.8zM5.4 11.1h13.2v1.8H5.4z',
      'M12 8.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2zm0 2.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z'],
  };

  const BY_FACILITY = {
    item_port_grinder_1: 'grinder',
    item_port_mix_pool_1: 'mix_pool',
    item_port_mix_pool_2: 'mix_pool',
    item_port_furnance_1: 'furnance',
    item_port_gas_reactor_1: 'gas_reactor',
    item_port_purification_1: 'purification',
    item_port_water_treatment_1: 'water_treatment',
    item_port_phase_trans_1: 'phase_trans_1',
    item_port_phase_trans_2: 'phase_trans_2',
    item_port_planter_1: 'planter',
    item_port_seedcol_1: 'seedcol',
    item_port_cmpt_mc_1: 'cmpt_mc',
    item_port_tools_asm_mc_1: 'tools_asm',
    item_port_shaper_1: 'shaper',
    item_port_filling_pd_mc_1: 'filling',
    item_port_winder_1: 'winder',
    item_port_thickener_1: 'thickener',
    item_port_vaporizer_1: 'vaporizer',
    item_port_dismantler_1: 'dismantler',
    item_port_xiranite_oven_1: 'xiranite_oven',
    thermal_bank_1: 'thermal_bank',
  };

  function path(key) {
    const d = DEF[key] || DEF.generic;
    const withFrame = d[0] === 1;
    return (withFrame ? [FRAME, ...d.slice(1)] : d.slice(1)).join(' ');
  }

  window.FAC_GLYPH = function (facilityId) {
    return path(BY_FACILITY[facilityId] || 'generic');
  };
  window.FAC_GLYPH_KEYS = Object.keys(DEF);
})();
