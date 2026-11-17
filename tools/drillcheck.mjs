#!/usr/bin/env node
/* ============================================================
   掘り下げの印の棚卸し (tools/drillcheck.mjs)

   章ごとに、場面（s1〜s6）と段階ごとの印（YT.drill.mark）の数と、印の向き（層）を数える。
     node tools/drillcheck.mjs [--list] [--need 2-25] chapters/NN-*.html
   - 印の無い場面: --need の範囲（既定は第2〜25章。layers-plan.md §3 P4 の検収）の章で、印が 1 つも無い場面を問題として出す。
   - 1 つの段階に出る印が 4 つ以上: 注意（説明欄の下の一覧が 2 行を超え、1画面版の左の列の高さを食う）。
   - 向き: 印の行き先の層（assets/layers.js。部品は define の layer）が、上の場面の層の下（down をたどって届く層）なら「下」、
     上の場面と同じ層なら「同じ層」、どちらでもなければ「横」。「横」は数えるだけで落とさない（登録簿の down は粗いので、
     第4章 場面1 のしきい値を第13章 場面2 が使う、のような正しい依存も「横」になる）。--list で 1 本ずつ出す。
   印は 1 行に 1 つ、第 2 引数は文字の値だけの対象（{ to: '…', label: '…', steps: [1, 2], … }）で書く（lencheck・xrefcheck と同じ読み方）。
   場面は const sK = { … } の中にある印を、その場面の印として数える。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const L = createRequire(import.meta.url)(path.join(ROOT, 'assets/layers.js'));
const args = process.argv.slice(2);
const list = args.includes('--list');
let need = [2, 25];
const ni = args.indexOf('--need');
if (ni >= 0) { const m = /^(\d+)-(\d+)$/.exec(args[ni + 1] || ''); if (m) need = [Number(m[1]), Number(m[2])]; args.splice(ni, 2); }
const files = args.filter((a) => !a.startsWith('--'));

const key = (o, k) => { const m = new RegExp('\\b' + k + String.raw`:\s*(['"\x60])((?:\\.|(?!\1).)*)\1`).exec(o); return m ? m[2] : null; };
const nums = (o, k) => { const m = new RegExp('\\b' + k + String.raw`:\s*\[([^\]]*)\]`).exec(o); return m ? m[1].split(',').map((x) => Number(x.trim())).filter((x) => x > 0) : null; };
const partLayer = (name) => { try { const m = /\blayer:\s*'([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'assets/parts', name + '.js'), 'utf8')); return m ? [m[1]] : []; } catch (e) { return []; } };
const below = (ids) => {   // down をたどって届く層（自分は含めない）
  const out = new Set(), q = [...ids];
  while (q.length) for (const d of (L.byId[q.shift()] || {}).down || []) if (!out.has(d)) { out.add(d); q.push(d); }
  return out;
};

let bad = 0, warn = 0;
const total = { marks: 0, down: 0, same: 0, side: 0 };
for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  const ch = Number((/(\d\d)-[a-z0-9-]+\.html$/.exec(f) || [])[1] || 0);
  if (!ch) { console.log(`${f}: 章のファイルではない（NN-名前.html）`); continue; }
  const sAt = h.search(/^<script>\s*$/m), script = sAt >= 0 ? h.slice(sAt) : h;
  // 場面の範囲と段階の数（xrefcheck.mjs の countSteps と同じ読み方）
  const pos = [...script.matchAll(/const (s[1-6]) = \{/g)].map((m) => ({ id: m[1], at: m.index }));
  const scenes = pos.map((p, k) => {
    const body = script.slice(p.at, k + 1 < pos.length ? pos[k + 1].at : undefined);
    const st = body.indexOf('steps:'), end = body.indexOf('\n    ]', st);
    const n = st < 0 ? 1 : [...body.slice(st, end > 0 ? end : st + 12000).matchAll(/\{\s*(?:where:\s*'(?:\\.|[^'\\])*',\s*)?title:\s*'/g)].length || 1;
    return { id: p.id, sc: Number(p.id.slice(1)), at: p.at, end: k + 1 < pos.length ? pos[k + 1].at : script.length, n, marks: [] };
  });
  const loose = [];
  for (const m of script.matchAll(/\.mark\(([^,]+),\s*\{([^\n]*?)\}\s*\);/g)) {
    const o = m[2], sc = scenes.find((s) => m.index >= s.at && m.index < s.end);
    const to = key(o, 'to'), part = key(o, 'part');
    const mk = { to, part, step: Number((/\bstep:\s*(\d+)/.exec(o) || [])[1] || 0), steps: nums(o, 'steps'), label: key(o, 'label') || '', el: m[1].trim() };
    if (!sc) { loose.push(mk); continue; }
    const from = L.of(ch, sc.sc);
    let tl = [];
    if (part) tl = partLayer(part);
    else { const p = L.parse(to); if (p) tl = L.of(p.ch, p.sc); }
    const dn = below(from);
    mk.dir = tl.some((t) => dn.has(t)) ? '下' : tl.some((t) => from.includes(t)) ? '同じ層' : '横';
    mk.from = from; mk.tl = tl;
    sc.marks.push(mk);
  }
  const n = scenes.reduce((a, s) => a + s.marks.length, 0);
  const cnt = { 下: 0, 同じ層: 0, 横: 0 };
  scenes.forEach((s) => s.marks.forEach((m) => cnt[m.dir]++));
  total.marks += n; total.down += cnt['下']; total.same += cnt['同じ層']; total.side += cnt['横'];
  const required = ch >= need[0] && ch <= need[1];
  const empty = scenes.filter((s) => !s.marks.length);
  console.log(`\n${f}: 印 ${n} 個（下 ${cnt['下']}・同じ層 ${cnt['同じ層']}・横 ${cnt['横']}）${required ? '' : '（印の数は問わない章）'}`);
  console.log('  ' + scenes.map((s) => `${s.id} ${s.marks.length}${!s.marks.length && required ? ' ✗' : ''}`).join('  '));
  if (required && empty.length) { bad += empty.length; console.log('  印の無い場面: ' + empty.map((s) => s.id).join('・')); }
  for (const s of scenes) {
    for (let k = 1; k <= s.n; k++) {
      const vis = s.marks.filter((m) => !m.steps || m.steps.includes(k));
      if (vis.length > 3) { warn++; console.log(`  注意: ${s.id} 段階${k} に印 ${vis.length} 個（一覧が 2 行を超える。3 個まで）`); }
    }
    const over = s.marks.filter((m) => m.steps && m.steps.some((k) => k > s.n));
    over.forEach((m) => { bad++; console.log(`  無い段階に印: ${s.id}「${m.label}」steps ${JSON.stringify(m.steps)}（段階は ${s.n} 個）`); });
  }
  if (loose.length) { warn += loose.length; console.log('  注意: 場面（const sK = { … }）の外の印 ' + loose.length + ' 個（場面を数えられない）: ' + loose.map((m) => m.label || m.to || m.part).join('、')); }
  if (list) for (const s of scenes) for (const m of s.marks) {
    console.log(`  ${s.id} ${m.steps ? '段階' + m.steps.join('・') : '全段階'}「${m.label}」→ ${m.part ? '部品 ' + m.part + (m.step ? ' 段階' + m.step : '') : m.to}（${m.from.join('+')} → ${m.tl.join('+') || '?'}：${m.dir}）`);
  }
}
console.log(`\n印 ${total.marks} 個（下 ${total.down}・同じ層 ${total.same}・横 ${total.side}）、問題 ${bad} 件、注意 ${warn} 件`);
process.exit(bad ? 1 : 0);
