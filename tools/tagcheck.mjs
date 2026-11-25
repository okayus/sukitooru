#!/usr/bin/env node
/* ============================================================
   タグの語彙を確かめる (tools/tagcheck.mjs)

   assets/tags.js（タグの語彙）と、news/*.md のタグの印（tags・prereqs・tag-candidates）について、次を確かめる。外れたら終了コード 1。
     ・id が英小文字・数字・ハイフンで重ならない。正規の名前が NFKC で変わらず、前後に空白が無く、「、」を含まず、30 字まで
     ・正規の名前と別名の key（NFKC・空白・小文字をならした形）が、語彙の中でも ignore とも重ならない。layer が層の登録簿にある
     ・ノートの印が語彙の名前だけを使う（assets/tags.js の checkNote。tools/build-news.mjs と同じ読み方）
   使い方: node tools/tagcheck.mjs [--list]
     --list で、層ごとの語彙（正規の名前・別名・付いたノートの数）と、語彙に無い候補を出す。日刊の書き手はこれを見てタグを選ぶ。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require('../assets/tags.js');
const L = require('../assets/layers.js');
const errors = [];
const bad = (m) => errors.push(m);

/* ---------- 語彙 ---------- */
const ids = new Set(), owner = new Map();   // key → その key を持つタグの id
for (const t of T.tags) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(t.id || '')) bad(`id「${t.id}」は英小文字・数字・ハイフンで書く`);
  if (ids.has(t.id)) bad(`id が重なる: ${t.id}`);
  ids.add(t.id);
  if (typeof t.name !== 'string' || !t.name) { bad(`${t.id}: name が無い`); continue; }
  if (t.name !== t.name.normalize('NFKC').trim()) bad(`${t.id}: name「${t.name}」が NFKC で変わるか、前後に空白がある`);
  if (/[、>]/.test(t.name)) bad(`${t.id}: name に「、」か「>」がある（印の区切りと閉じに使う）`);
  if (T.key(t.name).length > T.MAX_LEN) bad(`${t.id}: name が長い（${T.MAX_LEN} 字まで）`);
  if (t.layer && !L.byId[t.layer]) bad(`${t.id}: layer「${t.layer}」は層の登録簿（assets/layers.js）に無い`);
  if (t.alias && !Array.isArray(t.alias)) bad(`${t.id}: alias は配列で書く`);
  for (const a of [t.name, ...(t.alias || [])]) {
    const k = T.key(a);
    if (!k) { bad(`${t.id}: 空の別名がある`); continue; }
    if (owner.has(k)) bad(owner.get(k) === t.id ? `${t.id}: 「${a}」は同じタグの名前か別名と同じ key（${k}）` : `${t.id}: 「${a}」の key（${k}）が ${owner.get(k)} と重なる`);
    else owner.set(k, t.id);
  }
}
for (const s of T.ignore) if (owner.has(T.key(s))) bad(`ignore の「${s}」が語彙の ${owner.get(T.key(s))} と重なる`);

/* ---------- ノート ---------- */
const NEWS = path.join(ROOT, 'news');
const notes = fs.readdirSync(NEWS).filter((f) => /^\d{4}-\d\d-\d\d-[a-z0-9-]+\.md$/.test(f)).sort();
const use = new Map(T.tags.map((t) => [t.id, { tags: 0, prereqs: 0 }]));
const cands = new Map();   // 候補 → それを挙げたノート
let warned = 0;
for (const f of notes) {
  const src = fs.readFileSync(path.join(NEWS, f), 'utf8');
  const r = T.checkNote(src, { daily: /^<!--\s*kind:\s*daily\s*-->\s*$/m.test(src), isLayer: (s) => !!L.byId[s] });
  for (const e of r.errors) bad(`news/${f}: ${e}`);
  for (const w of r.warnings) { console.warn(`注意 news/${f}: ${w}`); warned++; }
  for (const t of [...r.tags, ...r.promoted.map((p) => p.tag)]) use.get(t.id).tags++;
  for (const t of r.prereqs) use.get(t.id).prereqs++;
  for (const c of r.candidates) { if (!cands.has(c)) cands.set(c, []); cands.get(c).push(f.slice(0, 10)); }
  for (const p of r.promoted) console.log(`news/${f}: 候補「${p.name}」は語彙の「${p.tag.name}」として内容のタグにした`);
}

/* ---------- 一覧 ---------- */
if (process.argv.includes('--list')) {
  const line = (t) => {
    const u = use.get(t.id), n = [u.tags ? `内容 ${u.tags}` : '', u.prereqs ? `前提 ${u.prereqs}` : ''].filter(Boolean).join('・');
    return `  ${t.name}${t.alias && t.alias.length ? `（別名: ${t.alias.join('、')}）` : ''}${n ? ` … ${n}` : ''}`;
  };
  for (const x of L.layers) {
    const ts = T.tags.filter((t) => t.layer === x.id);
    if (ts.length) console.log(`${x.name}（${x.id}）\n${ts.map(line).join('\n')}`);
  }
  console.log(`層をまたぐ\n${T.tags.filter((t) => !t.layer).map(line).join('\n')}`);
  console.log(`語彙に無い候補（ノートの tag-candidates）: ${cands.size ? [...cands].map(([c, ds]) => `${c}（${ds.join('・')}）`).join('、') : 'なし'}`);
}

if (errors.length) {
  console.error(`✗ タグ ${errors.length} 件:`);
  for (const e of errors) console.error('  ・' + e);
  process.exit(1);
}
const used = [...use.values()].filter((u) => u.tags || u.prereqs).length;
console.log(`✓ 語彙 ${T.tags.length} 個（ノートに付いているもの ${used} 個）、ノート ${notes.length} 件、候補 ${cands.size} 個${warned ? `、別名の読み替え ${warned} 件` : ''}`);
