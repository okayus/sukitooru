#!/usr/bin/env node
/* ============================================================
   他の章へのリンクの行き先を確かめる (tools/xrefcheck.mjs)

   章の中の「他の章へのリンク」を全部拾い、行き先の章・場面・段階が在るかと、
   札の「第N章 場面K」が行き先と合っているかを確かめる。掘り下げの印（YT.drill.mark / ctx.mark）の
   行き先（to）もここで確かめ、部品（part: '名前'）は assets/parts/名前.js が在って YT.parts.define('名前' を呼ぶか、
   step: N がその部品の段階の数に収まるかを見る。部品のファイル（assets/parts/*.js）も渡せる（行き先は chapters/ から引く）。
     node tools/xrefcheck.mjs chapters/NN-*.html assets/parts/*.js
   拾うもの: 段階の本文の [[NN-名前.html#sK.J|…]]（docs/authoring.md §3）、HTML や SVG の href="NN-名前.html#sK.J"、
   スクリプトの中の 'NN-名前.html#sK' の文字列。verify.mjs は最後に表示していた段階のリンクしか見ないので、これで補う。
   行き先の段階の数は、行き先の章の const sK = { … steps: [ … ] } の title の数で数える。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const stepsOf = new Map();
function countSteps(file) {
  if (stepsOf.has(file)) return stepsOf.get(file);
  const h = fs.readFileSync(file, 'utf8');
  const script = h.slice(Math.max(0, h.search(/^<script>\s*$/m)));   // 段階の題に「<script>」の文字が入ることがある（第10章）ので、行頭の開始タグで探す
  const re = /const (s[1-6]) = \{/g; let m; const pos = [];
  while ((m = re.exec(script))) pos.push([m[1], m.index]);
  const out = {};
  for (const [id, at] of pos) {
    const next = pos.find((x) => x[1] > at);
    const body = script.slice(at, next ? next[1] : undefined);
    const st = body.indexOf('steps:');
    if (st < 0) { out[id] = 0; continue; }
    const end = body.indexOf('\n    ]', st);
    const seg = body.slice(st, end > 0 ? end : st + 12000);
    out[id] = [...seg.matchAll(/\{\s*(?:where:\s*'(?:\\.|[^'\\])*',\s*)?title:\s*'/g)].length;
  }
  const ids = [...h.matchAll(/<section class="scene[^"]*" id="(s\d+)"/g)].map((x) => x[1]);
  const r = { steps: out, ids };
  stepsOf.set(file, r);
  return r;
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const partSteps = (name) => {
  const file = path.join(ROOT, 'assets/parts', name + '.js');
  if (!fs.existsSync(file)) return { ok: false, why: '部品のファイルが無い（assets/parts/' + name + '.js）' };
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes("YT.parts.define('" + name + "'")) return { ok: false, why: "YT.parts.define('" + name + "' が無い" };
  return { ok: true, n: (src.match(/^\s*\{\s*title:\s*'/gm) || []).length };
};
let bad = 0, total = 0;
for (const f of process.argv.slice(2)) {
  const h = fs.readFileSync(f, 'utf8');
  const dir = /(^|\/)assets\/parts\//.test(f) ? path.join(ROOT, 'chapters') : path.dirname(f);
  const refs = [
    ...[...h.matchAll(/\[\[(\d\d-[a-z0-9-]+\.html)(?:#(s\d+)(?:\.(\d+))?)?\|([^\]]+)\]\]/g)].map((m) => ({ file: m[1], sc: m[2], st: m[3], label: m[4], how: '本文' })),
    ...[...h.matchAll(/href="(\d\d-[a-z0-9-]+\.html)(?:#(s\d+)(?:\.(\d+))?)?"/g)].map((m) => ({ file: m[1], sc: m[2], st: m[3], label: '', how: 'href' })),
    ...[...h.matchAll(/['`](\d\d-[a-z0-9-]+\.html)(?:#(s\d+)(?:\.(\d+))?)?['`]/g)].map((m) => ({ file: m[1], sc: m[2], st: m[3], label: '', how: 'script の文字列' }))
  ];
  console.log(`\n${f}: 他の章へのリンク ${refs.length} 本`);
  // 掘り下げの印の部品
  for (const m of h.matchAll(/\.mark\([^,]+,\s*\{([^\n]*?)\}\s*\);/g)) {
    const pm = /part:\s*'([^']+)'/.exec(m[1]);
    if (!pm) continue;
    total++;
    const ps = partSteps(pm[1]), sm = /\bstep:\s*(\d+)/.exec(m[1]);
    if (!ps.ok) { console.log('  部品: ' + pm[1] + ' — ' + ps.why); bad++; continue; }
    if (sm && (Number(sm[1]) < 1 || Number(sm[1]) > ps.n)) { console.log(`  部品の無い段階: ${pm[1]} の段階 ${sm[1]}（段階は ${ps.n} 個）`); bad++; }
  }
  for (const r of refs) {
    total++;
    const target = path.join(dir, r.file);
    const where = `${r.file}${r.sc ? '#' + r.sc + (r.st ? '.' + r.st : '') : ''}${r.label ? '「' + r.label + '」' : ''}（${r.how}）`;
    if (!fs.existsSync(target)) { console.log('  無い章: ' + where); bad++; continue; }
    if (!r.sc) continue;
    const t = countSteps(target);
    if (!t.ids.includes(r.sc)) { console.log('  無い場面: ' + where); bad++; continue; }
    if (r.st) {
      const n = t.steps[r.sc] || 0;
      if (Number(r.st) < 1 || Number(r.st) > n) { console.log(`  無い段階: ${where}（その場面の段階は ${n} 個）`); bad++; }
    }
    // 札の「第N章 場面K」と行き先の食い違い
    const lm = /第(\d+)章(?:\s*場面\s*(\d+))?(?:\s*の段階\s*(\d+))?/.exec(r.label);
    if (lm) {
      const n = Number(r.file.slice(0, 2));
      if (Number(lm[1]) !== n || (lm[2] && 's' + lm[2] !== r.sc) || (lm[3] && lm[3] !== r.st)) { console.log('  札と行き先が食い違う: ' + where); bad++; }
    }
  }
}
console.log(`\n確かめたリンク ${total} 本、問題 ${bad} 件`);
process.exit(bad ? 1 : 0);
