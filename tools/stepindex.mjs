#!/usr/bin/env node
/* ============================================================
   場面・段階の索引 (tools/stepindex.mjs)

   章の場面の見出しと、段階ごとの「行き先 題 | 本文」を 1 行ずつ出す。掘り下げの印の行き先
   （07-shuuhen.html#s4.3 の形。docs/authoring.md §5.5）を grep で探すために使う。
     node tools/stepindex.mjs [chapters/NN-*.html …]  > 索引.txt     （省くと全章）
   本文は章のスクリプトの文字のまま（{e|…}・[[…|…]]・**…** の記法を含む）。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(ROOT, 'chapters');
const given = process.argv.slice(2);
const files = given.length ? given : fs.readdirSync(dir).filter((x) => /^\d\d-.*\.html$/.test(x)).sort().map((x) => path.join(dir, x));
const key = (line, k) => { const m = new RegExp('\\b' + k + String.raw`:\s*(['"\x60])((?:\\.|(?!\1).)*)\1`).exec(line); return m ? m[2].replace(/\\'/g, "'") : null; };
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
for (const file of files) {
  const f = path.basename(file);
  const h = fs.readFileSync(file, 'utf8');
  console.log(`\n=== ${f}  ${strip((/<title>([^<]*)<\/title>/.exec(h) || [])[1] || '')}`);
  const heads = {};
  for (const m of h.matchAll(/<h2 id="h-(s\d+)">([\s\S]*?)<\/h2>/g)) heads[m[1]] = strip(m[2]).replace(/^\d+/, '');
  const sAt = h.search(/^<script>\s*$/m), script = sAt >= 0 ? h.slice(sAt) : h;
  const pos = [...script.matchAll(/(?:const |SC\.)(s[1-6]) = \{/g)].map((m) => ({ id: m[1], at: m.index }));
  pos.forEach((p, k) => {
    const body = script.slice(p.at, k + 1 < pos.length ? pos[k + 1].at : undefined);
    console.log(`-- ${f}#${p.id}  ${heads[p.id] || ''}`);
    const st = body.indexOf('steps:');
    if (st < 0) return;
    const end = body.indexOf('\n    ]', st);
    let j = 0;
    for (const ln of body.slice(st, end > 0 ? end : st + 20000).split('\n')) {
      if (!/^\s*\{/.test(ln) || !/\btitle:\s*['"\x60]/.test(ln)) continue;
      console.log(`${f}#${p.id}.${++j}  ${key(ln, 'title')} | ${key(ln, 'text') || ''}`);
    }
  });
}
