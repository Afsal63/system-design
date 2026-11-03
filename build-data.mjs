// Regenerates data.js from the System Design 101 repo.
// Usage: node build-data.mjs [path-to-repo-data-dir]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || path.join(here, '..', 'system-design-101', 'data');
const fm = s => { const m = s.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); if (!m) return [{}, s];
  const d = {}; let key = null;
  for (const line of m[1].split('\n')) {
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && key) { (d[key] ||= []).push(li[1].replace(/^["']|["']$/g, '')); continue; }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) { key = kv[1]; const v = kv[2].trim(); d[key] = v === '' ? [] : v.replace(/^["']|["']$/g, ''); }
  }
  return [d, m[2]];
};
// Custom content in ./custom (categories/, guides/) is merged in and survives upstream re-syncs.
const custom = path.join(here, 'custom');
const list = dir => [[root, false], [custom, true]].flatMap(([base, own]) => {
  const d = path.join(base, dir); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.md')).map(f => ({ f, file: path.join(d, f), own })) : []; });
const categories = list('categories').map(({ f, file }) => { const [d] = fm(fs.readFileSync(file, 'utf8'));
  return { id: f.replace('.md', ''), title: d.title, description: d.description, sort: +d.sort }; }).sort((a, b) => a.sort - b.sort);
const guides = list('guides').map(({ f, file, own }) => { const [d, body] = fm(fs.readFileSync(file, 'utf8'));
  const image = typeof d.image === 'string' ? d.image : '';
  let b = body.trim();
  if (image) b = b.replace(/^!\[[^\]]*\]\([^)]*\)\s*/, ''); // shown separately as the hero diagram
  return { id: f.replace('.md', ''), title: d.title, description: d.description, image, createdAt: d.createdAt,
    categories: Array.isArray(d.categories) ? d.categories : [], tags: Array.isArray(d.tags) ? d.tags : [], body: b,
    ...(own ? { custom: true, sort: +d.sort || 0 } : {}) };
}).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || (a.sort || 0) - (b.sort || 0));
const ids = new Set(); for (const g of guides) { if (ids.has(g.id)) throw new Error('duplicate guide id: ' + g.id); ids.add(g.id); }
const catIds = new Set(categories.map(c => c.id));
for (const g of guides) { const bad = g.categories.filter(c => !catIds.has(c)); if (bad.length) console.warn(`warn: ${g.id} has unknown categories ${bad}`); }
fs.writeFileSync(path.join(here, 'data.js'), 'window.ATLAS_DATA = ' + JSON.stringify({ categories, guides }) + ';\n');
console.log(`data.js: ${categories.length} categories, ${guides.length} guides (${guides.filter(g => g.custom).length} custom)`);
