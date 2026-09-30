import fs from 'node:fs';

const html = fs.readFileSync('snapshot/items.html', 'utf8');
const d = JSON.parse(fs.readFileSync('endfield_recipes.json', 'utf8'));

const outC = {}, inC = {};
for (const r of d.recipes) {
  for (const o of r.outputs) outC[o.itemId] = (outC[o.itemId] || 0) + 1;
  for (const i of r.inputs) inC[i.itemId] = (inC[i.itemId] || 0) + 1;
}

const titles = {};
for (const m of html.matchAll(/title="([^"]*)" data-testid="item-card-([a-z0-9_]+)"/g)) titles[m[2]] = m[1];

const cardIds = new Set(Object.keys(titles));

// 1. cards without a count but dataset says it IS produced by >=1 recipe
const bad = [];
for (const [id, t] of Object.entries(titles)) {
  if (/\(\d+\)$/.test(t)) continue;
  if ((outC[id] ?? 0) >= 1) bad.push({ id, t, n: outC[id] });
}
console.log('cards WITHOUT count but dataset produce>=1 :', bad.length);
for (const b of bad.slice(0, 30)) console.log('   ', b.id, b.t, 'mine=' + b.n);

// 2. reference: items with produce>=1 in dataset -> must ALL be cards with counts
const produced = Object.keys(outC);
const producedCards = produced.filter(id => cardIds.has(id));
console.log('\ndataset items with >=1 producing recipe:', produced.length);
console.log('  of which shown as cards:', producedCards.length);
console.log('  NOT shown as cards:', produced.filter(id => !cardIds.has(id)).length,
  produced.filter(id => !cardIds.has(id)));

// 3. full dataset item coverage
console.log('\nall dataset items:', d.items.length, ' as cards:', d.items.filter(i => cardIds.has(i.id)).length);
const notCard = d.items.filter(i => !cardIds.has(i.id));
console.log('NOT as cards:', notCard.length);
for (const it of notCard) console.log(`   ${it.id} ${it.names.zh} produce=${outC[it.id] ?? 0} consume=${inC[it.id] ?? 0} cat=${it.category}`);
