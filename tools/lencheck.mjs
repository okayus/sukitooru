#!/usr/bin/env node
/* ============================================================
   本文の字数の目安を超える所を出す (tools/lencheck.mjs)

   段階の本文 160 字・リード 110 字・補足 1 段落 140 字（docs/authoring.md §2）と、掘り下げの印のつなぎの一文 60 字・
   上の要素の名前 20 字（docs/authoring.md「掘り下げ」）を超える所を章ごとに出す。部品（assets/parts/*.js）も渡せる
   （段階の本文 160 字、注記 140 字、図の説明 120 字、リード 110 字、印）。
     node tools/lencheck.mjs chapters/NN-*.html assets/parts/*.js
   注意: 本文がテンプレート文字列で式（${…}）を含むと、式をそのまま数えるので実際より多く出る。
   その章は式を短い定数に出すか、描画後の本文で数える。
   ============================================================ */
import fs from 'node:fs';
const strip = (h) => h.replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const plain = (s) => s.replace(/\*\*|`|\{[ehprdx]\|([^}]*)\}/g, '$1').replace(/\[\[\d+(?::\d+)?\|([^\]]+)\]\]/g, '$1').replace(/\[\[\d\d-[a-z0-9-]+\.html(?:#s\d+(?:\.\d+)?)?\|([^\]]+)\]\]/g, '$1');
const len = (s) => Array.from(plain(s)).length;
const key = (line, k) => { const m = new RegExp(k + String.raw`:\s*(['"\x60])((?:\\.|(?!\1).)*)\1`).exec(line); return m ? m[2].replace(/\\'/g, "'") : null; };
/* 掘り下げの印（YT.drill.mark / ctx.mark の第 2 引数）の bridge と label */
const marks = (src, out) => {
  for (const m of src.matchAll(/\.mark\([^,]+,\s*\{([^\n]*?)\}\s*\);/g)) {
    const o = m[1], b = key(o, 'bridge'), l = key(o, 'label'), to = key(o, 'to') || key(o, 'part');
    if (!b) out.push(`印（${l || to}）つなぎの一文が無い`);
    else if (len(b) > 60) out.push(`印（${l || to}）つなぎの一文 ${len(b)} 字（目安 60）`);
    if (l && len(l) > 20) out.push(`印（${l}）上の要素の名前 ${len(l)} 字（目安 20）`);
  }
};
for (const f of process.argv.slice(2)) {
  const html = fs.readFileSync(f, 'utf8');
  const out = [];
  if (/\.js$/.test(f)) {
    // 部品: YT.parts.define('名前', { … steps: [ … ] … })
    if (!/YT\.parts\.define\(/.test(html)) out.push('YT.parts.define が無い（部品のファイルではない）');
    let k = 0;
    for (const ln of html.split('\n')) {
      if (/^\s*\{\s*title:\s*['"\x60]/.test(ln)) { k++; const t = key(ln, 'text'); if (t && len(t) > 160) out.push(`段階${k}「${key(ln, 'title')}」 ${len(t)} 字（目安 160）`); }
      const nt = /^\s*note:\s*/.test(ln) && key(ln, 'note'); if (nt && len(nt) > 140) out.push(`注記 ${len(nt)} 字（目安 140）`);
      const cp = /^\s*caption:\s*/.test(ln) && key(ln, 'caption'); if (cp && len(cp) > 120) out.push(`図の説明 ${len(cp)} 字（目安 120）`);
      const ld = /^\s*lead:\s*/.test(ln) && key(ln, 'lead'); if (ld && len(ld) > 110) out.push(`リード ${len(ld)} 字（目安 110。parts.html の場面のリード）`);
    }
    if (!k) out.push('段階の本文を数えられない（steps: [ { title, text }, … ] を 1 段階 1 行で書く）');
    marks(html, out);
    console.log(`${f}: ${out.length ? '' : '超過なし'}`);
    for (const o of out) console.log('  ' + o);
    continue;
  }
  const secs = [...html.matchAll(/<section class="scene ([^"]*)" id="(s\d+)"[^>]*>([\s\S]*?)<\/section>/g)];
  for (const s of secs) {
    const [, , id, body] = s;
    const lead = body.match(/<p class="prose a-lead">([\s\S]*?)<\/p>/);
    if (lead && len(strip(lead[1])) > 110) out.push(`${id} リード ${len(strip(lead[1]))} 字（目安 110）`);
    const after = body.match(/<div class="prose a-after">([\s\S]*?)<\/div>/);
    if (after) for (const p of after[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) if (len(strip(p[1])) > 140) out.push(`${id} 補足 ${len(strip(p[1]))} 字（目安 140）`);
  }
  const blocks = [...html.matchAll(/const\s+(s\d+)\s*=\s*\{[\s\S]*?steps:\s*\[([\s\S]*?)\n\s*\],?/g)];
  // 動く場面なのに段階の本文を数えられないときは黙って通さない（2026-11-14、SC.s1 = { の形の章が 34 段階とも超過を見逃した）
  const counted = new Set(blocks.map((b) => b[1]));
  for (const s of secs) if (/\bsc-anim\b/.test(s[1]) && !counted.has(s[2])) out.push(`${s[2]} 段階の本文を数えられない（const ${s[2]} = { steps: [ … ] } の形で書く）`);
  for (const b of blocks) {
    let k = 0;
    for (const ln of b[2].split('\n')) {
      if (!/\btitle:\s*['"\x60]/.test(ln) || !/^\s*\{/.test(ln)) continue;
      k++;
      const t = key(ln, 'text');
      if (t && len(t) > 160) out.push(`${b[1]} 段階${k}「${key(ln, 'title')}」 ${len(t)} 字（目安 160）`);
    }
  }
  marks(html, out);
  console.log(`${f}: ${out.length ? '' : '超過なし'}`);
  for (const o of out) console.log('  ' + o);
}
