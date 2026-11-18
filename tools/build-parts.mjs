#!/usr/bin/env node
/* ============================================================
   部品の見本の「使う所」を作り直す (tools/build-parts.mjs)

   chapters/*.html の掘り下げの印（YT.drill.mark の 1 行。第 2 引数に part: '名前'）を集め、
   parts.html の USES（/* USES:BEGIN *\/ と /* USES:END *\/ の間）を書き直す。
   値は [行き先の場面・段階（印のある章の場面と段階）, 上の要素の名前] の列で、章・場面・段階の順。
   印を足した・張り替えたら走らせる。--check は書き換えずに、parts.html が古ければ終了コード 1。
     node tools/build-parts.mjs [--check]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const key = (o, k) => { const m = new RegExp('\\b' + k + ":\\s*'((?:\\\\.|[^'\\\\])*)'").exec(o); return m ? m[1] : null; };
const nums = (o, k) => { const m = new RegExp('\\b' + k + ':\\s*\\[([^\\]]*)\\]').exec(o); return m ? m[1].split(',').map((x) => Number(x.trim())).filter((x) => x > 0) : null; };

const uses = {};
const files = fs.readdirSync(path.join(ROOT, 'chapters')).filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f)).sort();
for (const f of files) {
  const h = fs.readFileSync(path.join(ROOT, 'chapters', f), 'utf8');
  const sAt = h.search(/^<script>\s*$/m), script = sAt >= 0 ? h.slice(sAt) : h;
  const pos = [...script.matchAll(/const (s[1-6]) = \{/g)].map((m) => ({ sc: Number(m[1].slice(1)), at: m.index }));
  for (const m of script.matchAll(/\.mark\(([^,]+),\s*\{([^\n]*?)\}\s*\);/g)) {
    const o = m[2], part = key(o, 'part');
    if (!part) continue;
    const sc = pos.filter((p) => p.at <= m.index).pop();
    if (!sc) continue;
    const steps = nums(o, 'steps');
    const to = f + '#s' + sc.sc + (steps && steps.length ? '.' + steps[0] : '');
    (uses[part] || (uses[part] = [])).push([to, key(o, 'label') || '']);
  }
}
const order = (a) => { const m = /^(\d\d)-[^#]+#s(\d+)(?:\.(\d+))?/.exec(a[0]); return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3] || 0) : 0; };
Object.values(uses).forEach((v) => v.sort((a, b) => order(a) - order(b)));
const names = Object.keys(uses).sort();
const block = '/* USES:BEGIN */\n  const USES = {\n' + names.map((n) => `    '${n}': [\n` + uses[n].map((u) => `      ['${u[0]}', '${u[1].replace(/'/g, "\\'")}']`).join(',\n') + '\n    ]').join(',\n') + '\n  };\n  /* USES:END */';
const file = path.join(ROOT, 'parts.html');
const html = fs.readFileSync(file, 'utf8');
const re = /\/\* USES:BEGIN \*\/[\s\S]*?\/\* USES:END \*\//;
if (!re.test(html)) { console.error('parts.html に /* USES:BEGIN */ … /* USES:END */ が無い'); process.exit(2); }
const out = html.replace(re, () => block);
const summary = names.map((n) => `${n} ${uses[n].length}`).join('、') || 'なし';
if (check) {
  if (out !== html) { console.log('✗ parts.html の使う所が古い（node tools/build-parts.mjs で作り直す）。章の印: ' + summary); process.exit(1); }
  console.log('✓ parts.html の使う所は章の印と一致: ' + summary);
} else {
  if (out !== html) fs.writeFileSync(file, out);
  console.log((out !== html ? '書き直した' : '変わらない') + ': parts.html の使う所（' + summary + '）');
}
