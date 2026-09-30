// Extract the complete Endfield industrial recipe dataset from GameHeads.gg data modules.
import fs from 'node:fs';

const items = await import('./modules/items.DTvmMKUI.js');
const recipes = await import('./modules/recipes.jOKiAgl3.js');
const data = await import('./modules/data.Brj2dRTm.js');
const tr = await import('./modules/translator.CzV8ub3Q.js');

const NAME_LOCALES = ['zh', 'en', 'ja'];
const msg = Object.fromEntries(NAME_LOCALES.map(l => [l, tr.r(l)]));

const facilityMeta = new Map(items.s.map(f => [f.id, f]));
const itemMeta = new Map(items.t.map(i => [i.id, i]));

// --- recipes ---
const allRecipes = recipes.t.map(r => ({
  id: r.id,
  facilityId: r.facilityId,
  craftingTime: r.craftingTime,
  inputs: r.inputs.map(x => ({ itemId: x.itemId, amount: x.amount })),
  outputs: r.outputs.map(x => ({ itemId: x.itemId, amount: x.amount })),
  ...(r.availability !== undefined ? { availability: r.availability } : {}),
  ...(r.producedGasEnv !== undefined ? { producedGasEnv: r.producedGasEnv } : {}),
  ...(r.requiredGasEnv !== undefined ? { requiredGasEnv: r.requiredGasEnv } : {}),
  ...(r.gasEnvBaseRecipeId !== undefined ? { gasEnvBaseRecipeId: r.gasEnvBaseRecipeId } : {}),
  ...(r.producedPowerW !== undefined ? { producedPowerW: r.producedPowerW } : {}),
}));

// --- item universe: everything that appears in any recipe ---
const used = new Set();
for (const r of allRecipes) {
  for (const i of r.inputs) used.add(i.itemId);
  for (const o of r.outputs) used.add(o.itemId);
}

const baseResources = data.i instanceof Set ? [...data.i] : [];

const itemList = [...used].sort().map(id => {
  const meta = itemMeta.get(id) || {};
  return {
    id,
    names: Object.fromEntries(NAME_LOCALES.map(l => [l, (msg[l].items || {})[id] ?? null])),
    category: meta.category ?? null,
    tier: meta.tier ?? null,
    isBaseResource: baseResources.includes(id),
    ...(meta.transportMode ? { transportMode: meta.transportMode } : {}),
  };
});

// --- facilities ---
const usedFacilities = [...new Set(allRecipes.map(r => r.facilityId))].sort();
const facilityList = usedFacilities.map(id => {
  const meta = facilityMeta.get(id) || {};
  return {
    id,
    names: Object.fromEntries(NAME_LOCALES.map(l => [l, (msg[l].facilities || {})[id] ?? null])),
    category: meta.category ?? null,
    tier: meta.tier ?? null,
    powerConsumption: meta.powerConsumption ?? null,
  };
});

const dataset = {
  source: 'https://gameheads.gg/zh/g/endfield/items',
  extractedAt: new Date().toISOString(),
  stats: {
    items: itemList.length,
    recipes: allRecipes.length,
    facilities: facilityList.length,
  },
  items: itemList,
  facilities: facilityList,
  recipes: allRecipes,
};

fs.writeFileSync('endfield_recipes.json', JSON.stringify(dataset, null, 2), 'utf8');

console.log('items:', itemList.length);
console.log('recipes:', allRecipes.length);
console.log('facilities:', facilityList.length);

// stats
const byFacility = {};
for (const r of allRecipes) byFacility[r.facilityId] = (byFacility[r.facilityId] || 0) + 1;
console.log('\nrecipes per facility:');
for (const [f, c] of Object.entries(byFacility).sort((a, b) => b[1] - a[1])) {
  console.log(' ', (msg.zh.facilities[f] || f).padEnd(12), c);
}

const outCount = {};
for (const r of allRecipes) for (const o of r.outputs) outCount[o.itemId] = (outCount[o.itemId] || 0) + 1;
const multi = Object.entries(outCount).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
console.log('\nitems produced by >1 recipe:', multi.length);
console.log(multi.slice(0, 15).map(([i, c]) => `${msg.zh.items[i] || i}(${c})`).join(', '));

console.log('\nrecipes with 2+ outputs:',
  allRecipes.filter(r => r.outputs.length > 1).map(r => r.id).slice(0, 20));
