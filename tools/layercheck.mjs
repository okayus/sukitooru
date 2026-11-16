#!/usr/bin/env node
/* ============================================================
   層の登録簿を確かめる (tools/layercheck.mjs)

   assets/layers.js について、次を確かめる。外れたら終了コード 1。
     ・層の id が重ならず、列・下の層（down）が登録簿にあり、down が輪になっていない
     ・層の既定の行き先（home）の章と場面がある
     ・chapters/ の全章の全場面（s1〜s6）が、登録簿にある層を 1 つ以上持つ
     ・scenes の鍵（'章-場面'）が、ある章の場面を指す
   使い方: node tools/layercheck.mjs [--list]   （--list で層ごとの場面を出す）
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = createRequire(import.meta.url)('../assets/layers.js');
const errors = [];
const bad = (m) => errors.push(m);

/* 章ごとの場面（section.scene の id）を読む */
const chapters = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'chapters')).filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f)).sort()) {
  const html = fs.readFileSync(path.join(ROOT, 'chapters', f), 'utf8');
  const ids = [...html.matchAll(/<section class="scene[^"]*" id="s(\d+)"/g)].map((m) => Number(m[1]));
  chapters.set(Number(f.slice(0, 2)), { file: f, scenes: ids.filter((k) => k >= 1 && k <= 6), all: new Set(ids) });
}

/* 層 */
const ids = new Set();
const cols = new Set(L.cols.map((c) => c.id));
for (const x of L.layers) {
  if (ids.has(x.id)) bad(`層の id が重なる: ${x.id}`);
  ids.add(x.id);
  if (!cols.has(x.col)) bad(`${x.id}: 列 ${x.col} が無い`);
  if (!Number.isInteger(x.row)) bad(`${x.id}: row が整数でない`);
  const h = L.parse(x.home);
  const c = h && chapters.get(h.ch);
  if (!c || x.home.split('#')[0] !== c.file) bad(`${x.id}: 既定の行き先 ${x.home} の章が無い`);
  else if (h.sc && !c.all.has(h.sc)) bad(`${x.id}: 既定の行き先 ${x.home} の場面が無い`);
}
for (const x of L.layers) for (const d of x.down) if (!ids.has(d)) bad(`${x.id}: 下の層 ${d} が無い`);
/* 同じ列・同じ row に 2 つ置かない（図で重なる） */
const at = new Map();
for (const x of L.layers) { const k = x.col + ':' + x.row; if (at.has(k)) bad(`${x.id} と ${at.get(k)} が同じ位置（${k}）`); at.set(k, x.id); }
/* down が輪になっていないか（深さ優先） */
const state = new Map();
const visit = (id, trail) => {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) { bad(`下の層が輪になっている: ${[...trail, id].join(' → ')}`); return; }
  state.set(id, 1);
  for (const d of (L.byId[id] || { down: [] }).down) visit(d, [...trail, id]);
  state.set(id, 2);
};
for (const x of L.layers) visit(x.id, []);

/* 全場面 */
const perLayer = new Map(L.layers.map((x) => [x.id, []]));
let n = 0;
for (const [ch, c] of chapters) {
  if (!L.chapters[ch]) bad(`第${ch}章の既定の層が無い`);
  for (const sc of c.scenes) {
    n++;
    const ls = L.of(ch, sc);
    if (!ls.length) bad(`第${ch}章 場面${sc} に層が無い`);
    for (const id of ls) { if (!ids.has(id)) bad(`第${ch}章 場面${sc}: 層 ${id} が登録簿に無い`); else perLayer.get(id).push(`${ch}-${sc}`); }
  }
}
for (const ch of Object.keys(L.chapters)) {
  if (!chapters.has(Number(ch))) bad(`chapters に第${ch}章が無い`);
  for (const id of L.chapters[ch]) if (!ids.has(id)) bad(`第${ch}章の既定: 層 ${id} が登録簿に無い`);
}
for (const k of Object.keys(L.scenes)) {
  const [ch, sc] = k.split('-').map(Number);
  const c = chapters.get(ch);
  if (!c || !c.scenes.includes(sc)) bad(`scenes の ${k} が、ある章の場面（s1〜s6）を指さない`);
}

if (process.argv.includes('--list')) for (const [id, ks] of perLayer) console.log(`${id.padEnd(10)} ${L.byId[id].name}: ${ks.length} 場面 ${ks.join(' ')}`);
const empty = [...perLayer].filter(([, ks]) => !ks.length).map(([id]) => id);
if (empty.length) bad(`場面を 1 つも持たない層: ${empty.join('、')}`);
if (errors.length) {
  console.error('✗ assets/layers.js');
  for (const e of errors) console.error('  ・' + e);
  process.exit(1);
}
console.log(`✓ assets/layers.js — 層 ${L.layers.length}、章 ${chapters.size}、場面 ${n} がすべて層を持つ`);
