import fs from 'node:fs';

const html = fs.readFileSync('snapshot/items.html', 'utf8');
const d = JSON.parse(fs.readFileSync('endfield_recipes.json', 'utf8'));

// produce counts from my dataset
const outC = {};
for (const r of d.recipes) for (const o of r.outputs) outC[o.itemId] = (outC[o.itemId] || 0) + 1;
const inC = {};
for (const r of d.recipes) for (const i of r.inputs) inC[i.itemId] = (inC[i.itemId] || 0) + 1;

// titles from SSR html
const titles = {};
for (const m of html.matchAll(/title="([^"]*)" data-testid="item-card-([a-z0-9_]+)"/g)) {
  titles[m[2]] = m[1];
}
console.log('cards parsed:', Object.keys(titles).length);

const withCount = [];
const withoutCount = [];
for (const [id, t] of Object.entries(titles)) {
  const m = t.match(/^(.*?)\s*\((\d+)\)$/);
  if (m) withCount.push({ id, name: m[1], n: +m[2] });
  else withoutCount.push({ id, name: t });
}
console.log('with (N):', withCount.length, ' without:', withoutCount.length);

let mismatches = 0;
console.log('\n--- items whose title HAS a count: compare with dataset ---');
for (const w of withCount) {
  const mine = outC[w.id] ?? 0;
  if (mine !== w.n) {
    mismatches++;
    if (mismatches <= 40) console.log(`  MISMATCH ${w.id} (${w.name}) site=${w.n} mine=${mine}`);
  }
}
console.log('total mismatches among (N) cards:', mismatches);

console.log('\n--- items WITHOUT count in title: what does dataset say? ---');
const noCountNonOne = withoutCount.filter(w => (outC[w.id] ?? 0) !== 1);
console.log('without-count cards whose dataset produce-count != 1:', noCountNonOne.length);
for (const w of noCountNonOne.slice(0, 40)) console.log(`  ${w.id} (${w.name}) mine=${outC[w.id] ?? 0}`);

console.log('\n--- dataset items not present as cards ---');
const cardIds = new Set(Object.keys(titles));
for (const it of d.items) if (!cardIds.has(it.id)) console.log('  missing card:', it.id, it.names.zh, 'out=' + (outC[it.id] ?? 0), 'in=' + (inC[it.id] ?? 0));
