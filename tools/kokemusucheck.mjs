#!/usr/bin/env node
/* ============================================================
   苔むすに渡す中身の検査 (tools/kokemusucheck.mjs)

   ノートのページ（news/*.html。先に node tools/build-news.mjs で作る）に埋めた、苔むすに渡す中身（assets/kokemusu.js の post）を読み、
   今日を読んだ日として積むダイアログを開く URL（kokemusu.js の href）にしてから、苔むすと同じ手順で解いて確かめる:
     ・苔むすの契約の写し contracts/kokemusu/posts.schema.json に合うか。読む語は写しが今使うものだけで、知らない語が写しに入ったら止まる
     ・schema に書けない規則（本文が空白だけでない、石の名前が正規化して空にならない、日の順と厚み、今日より後の日が無い）
     ・# の中が post 1 つだけか、解くと元の中身に戻るか、行き先が苔むすの /積む か、本文がそのノートの公開版のページを指すか
   契約の読み方は苔むすの docs/senders.md「リンクで渡す」（写しの版と取り直し方は contracts/kokemusu/README.md）。

     node tools/kokemusucheck.mjs           写しで確かめる
     node tools/kokemusucheck.mjs --fetch   さらに苔むすの main の schema を取り、写しと違えば止まる
   終了コード: 合わない中身か、写しの古さがあれば 1
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = createRequire(import.meta.url)('../assets/kokemusu.js');
const SCHEMA = path.join(ROOT, 'contracts', 'kokemusu', 'posts.schema.json');
const RAW = 'https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders/posts.schema.json';
const SITE = 'https://sukitooru.shiraoka.workers.dev/';
const NEWS = path.join(ROOT, 'news');

const errors = [];
const fail = (s) => errors.push(s);

/* ---------- 写しの古さ（--fetch） ---------- */
const local = fs.readFileSync(SCHEMA, 'utf8');
if (process.argv.includes('--fetch')) {
  try {
    const res = await fetch(RAW);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const remote = await res.text();
    if (remote !== local) fail(`写しが苔むすの main と違う（${RAW}）。contracts/kokemusu/README.md の手順で取り直し、苔むすの docs/senders.md の変更履歴を読む`);
    else console.log('写し: 苔むすの main と同じ');
  } catch (e) {
    fail(`苔むすの main の schema を取れない: ${e.message}`);
  }
}

/* ---------- JSON Schema（写しが使う語だけを読む） ---------- */
const schema = JSON.parse(local);
const KNOWN = new Set(['$schema', '$id', 'title', 'description', 'type', 'properties', 'required', 'additionalProperties',
  'items', 'minLength', 'maxLength', 'maxItems', 'minimum', 'maximum', 'enum', 'anyOf', 'pattern', 'format']);
function words(s, at) {
  for (const k of Object.keys(s)) if (!KNOWN.has(k)) fail(`写しの ${at} に、この検査が読まない語「${k}」がある。tools/kokemusucheck.mjs の valid を直す`);
  if (s.type !== undefined && typeof s.type !== 'string') fail(`写しの ${at} の type が 1 つの名前でない`);
  if (s.format !== undefined && s.format !== 'date') fail(`写しの ${at} に、この検査が読まない format「${s.format}」がある`);
  if (s.additionalProperties !== undefined && s.additionalProperties !== false) fail(`写しの ${at} の additionalProperties が false でない`);
  for (const [k, x] of Object.entries(s.properties || {})) words(x, `${at}.${k}`);
  if (s.items) words(s.items, `${at}[]`);
  (s.anyOf || []).forEach((x, i) => words(x, `${at}（anyOf ${i + 1}）`));
}
words(schema, 'body');

/* 苔むすの isCalendarDay と同じ: YYYY-MM-DD で、暦にある日 */
function isDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10), t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const TYPES = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === 'string',
  integer: Number.isInteger,
  null: (v) => v === null
};
/* v が s に合わなければ、理由を out に足す。字数は苔むす（zod）と同じ UTF-16 の単位で数える */
function valid(v, s, at, out) {
  if (s.anyOf) {
    if (!s.anyOf.some((x) => !valid(v, x, at, []).length)) out.push(`${at}: anyOf のどれにも合わない（${JSON.stringify(v)}）`);
    return out;
  }
  if (s.type && !TYPES[s.type](v)) { out.push(`${at}: ${s.type} でない（${JSON.stringify(v)}）`); return out; }
  if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${s.enum.join('・')} のどれでもない`);
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) out.push(`${at}: ${s.minLength} 字より短い`);
    if (s.maxLength !== undefined && v.length > s.maxLength) out.push(`${at}: ${s.maxLength} 字より長い（${v.length} 字）`);
    if (s.pattern !== undefined && !new RegExp(s.pattern, 'u').test(v)) out.push(`${at}: 形 ${s.pattern} に合わない`);
    if (s.format === 'date' && !isDay(v)) out.push(`${at}: 暦にある日でない`);
  }
  if (Number.isInteger(v)) {
    if (s.minimum !== undefined && v < s.minimum) out.push(`${at}: ${s.minimum} より小さい`);
    if (s.maximum !== undefined && v > s.maximum) out.push(`${at}: ${s.maximum} より大きい`);
  }
  if (Array.isArray(v)) {
    if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`${at}: ${s.maxItems} 個より多い`);
    if (s.items) v.forEach((x, i) => valid(x, s.items, `${at}[${i}]`, out));
  }
  if (TYPES.object(v)) {
    for (const k of s.required || []) if (!(k in v)) out.push(`${at}.${k}: 要る項目が無い`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties && s.properties[k]) valid(x, s.properties[k], `${at}.${k}`, out);
      else if (s.additionalProperties === false) out.push(`${at}.${k}: 契約に無い項目`);
    }
  }
  return out;
}

/* schema に書けない規則（苔むすの docs/senders.md「日の規則」と、リンクの読み手が開かない条件） */
const norm = (s) => s.trim().normalize('NFKC').toLowerCase();
function rules(p, today) {
  const out = [];
  if (typeof p.body === 'string' && !p.body.trim()) out.push('本文が空白だけ');
  (Array.isArray(p.tags) ? p.tags : []).forEach((t, i) => { if (typeof t === 'string' && !norm(t)) out.push(`tags[${i}]: 正規化すると空になる`); });
  if (p.lastDay !== undefined && p.firstDay === undefined) out.push('lastDay だけがある（リンクでは開かない）');
  const first = p.firstDay, last = p.lastDay === undefined ? first : p.lastDay;
  if (first !== undefined) {
    if (first > today || last > today) out.push(`今日（${today}）より後の日がある`);
    if (last < first) out.push('lastDay が firstDay より前');
    const thick = p.thickness !== undefined && p.thickness !== null;
    if (first === last && thick) out.push('単日の苔片に thickness がある');
    if (first < last && !thick) out.push('続く苔片に thickness が無い');
  }
  return out;
}

/* ---------- ノートのページに埋めた中身 ---------- */
const now = Date.now(), today = K.day(now);
const notes = fs.readdirSync(NEWS).filter((f) => /^\d{4}-\d\d-\d\d-[a-z0-9-]+\.md$/.test(f)).sort();
let ok = 0, sample = '';
for (const f of notes) {
  const slug = f.replace(/\.md$/, ''), file = path.join(NEWS, slug + '.html');
  if (!fs.existsSync(file)) { fail(`news/${slug}.html が無い。先に node tools/build-news.mjs で作る`); continue; }
  const m = /^YT_KOKEMUSU\.mount\((\{.*\})\);$/m.exec(fs.readFileSync(file, 'utf8'));
  if (!m) { fail(`news/${slug}.html に苔むすに渡す中身（YT_KOKEMUSU.mount）が無い`); continue; }
  const post = JSON.parse(m[1]);
  const href = K.href(post, now), u = new URL(href);
  const keys = [...new URLSearchParams(u.hash.slice(1)).keys()];
  const got = JSON.parse(new URLSearchParams(u.hash.slice(1)).get('post'));
  const want = { ...post, firstDay: today };
  const errs = [
    ...valid(got, schema, 'body', []),
    ...rules(got, today),
    ...(u.origin !== K.ORIGIN || decodeURIComponent(u.pathname) !== '/積む' ? [`行き先が ${K.ORIGIN}/積む でない（${u.origin}${decodeURIComponent(u.pathname)}）`] : []),
    ...(u.search ? ['行き先に ? がある（中身は # の後ろだけに置く）'] : []),
    ...(keys.length !== 1 || keys[0] !== 'post' ? [`# の中が post 1 つでない（${keys.join('・')}）`] : []),
    ...(JSON.stringify(got) !== JSON.stringify(want) ? ['URL を解くと元の中身に戻らない'] : []),
    ...(typeof got.body === 'string' && got.body.endsWith(`](${SITE}news/${slug}.html)`) ? [] : ['本文がこのノートの公開版のページを指していない'])
  ];
  if (errs.length) fail(`news/${slug}.html:\n    ` + errs.join('\n    '));
  else { ok++; sample = href; }
}

if (errors.length) {
  console.error(errors.map((e) => '✗ ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ ${ok} 件のノートの中身が、苔むすの契約の写し（contracts/kokemusu/posts.schema.json）と日の規則に合い、URL を解くと元に戻る（読んだ日 ${today}）`);
console.log(`  例（新しいノート）: ${sample}`);
