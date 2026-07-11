// Manual test for the markdown sanitizer (src/lib/markdown.ts).
// Bundles the TS module with esbuild, then asserts XSS payloads are neutralized.
// Run: node scripts/test-sanitizer.mjs

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'md-sanitizer-'));
const outFile = join(outDir, 'markdown.mjs');

await build({
  entryPoints: [join(root, 'src/lib/markdown.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  outfile: outFile,
  logLevel: 'silent',
});

const { renderMarkdown } = await import(pathToFileURL(outFile).href);

let failed = 0;
function check(name, md, forbiddenPatterns, requiredPatterns = []) {
  const html = renderMarkdown(md);
  const problems = [];
  for (const p of forbiddenPatterns) {
    if (p.test(html)) problems.push(`forbidden ${p} survived`);
  }
  for (const p of requiredPatterns) {
    if (!p.test(html)) problems.push(`required ${p} missing`);
  }
  if (problems.length) {
    failed++;
    console.log(`FAIL ${name}\n  input:  ${JSON.stringify(md)}\n  output: ${JSON.stringify(html)}\n  ${problems.join('\n  ')}`);
  } else {
    console.log(`PASS ${name}\n  output: ${JSON.stringify(html.trim())}`);
  }
}

// 1. Raw script block
check('script tag escaped', '<script>alert(1)</script>', [/<script/i], [/&lt;script&gt;/]);

// 2. Inline img with onerror
check('img onerror escaped', 'hello <img src=x onerror=alert(1)> world', [/<img/i], [/&lt;img/]);

// 3. javascript: link — href must not appear as active link
check('javascript: link stripped', '[x](javascript:alert(1))', [/href\s*=\s*["']?javascript:/i, /<a /i]);

// 4. data: image stripped
check('data: image stripped', '![alt](data:text/html,<script>alert(1)</script>)', [/<img/i, /<script/i]);

// 5. vbscript: link stripped
check('vbscript: link stripped', '[x](vbscript:msgbox)', [/<a /i]);

// 6. Safe links/images still work
check('https link kept', '[ok](https://example.com/a?b=1)', [], [/<a href="https:\/\/example\.com\/a\?b=1">ok<\/a>/]);
check('relative link kept', '[ok](/archive)', [], [/<a href="\/archive">ok<\/a>/]);
check('mailto link kept', '[ok](mailto:a@b.c)', [], [/<a href="mailto:a@b\.c">ok<\/a>/]);
check('https image kept', '![alt](https://example.com/x.png)', [], [/<img src="https:\/\/example\.com\/x\.png" alt="alt"/]);

// 7. Code block with highlight.js still produces hljs markup, and embedded HTML in code is inert
check(
  'code block highlighted + escaped',
  '```js\nconst a = "<script>alert(1)</script>";\n```',
  [/<script/i],
  [/<pre><code class="hljs language-js">/, /hljs-/]
);

// 8. Fence info string cannot inject attributes
check('lang attribute injection blocked', '```js" onmouseover="alert(1)\nlet x = 1\n```', [/onmouseover\s*=\s*"alert/]);

// 9. Normal markdown still renders
check('basic markdown intact', '# Title\n\n**bold** and `code`', [], [/<h1[^>]*>/, /<strong>bold<\/strong>/, /<code>code<\/code>/]);

rmSync(outDir, { recursive: true, force: true });

if (failed) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll sanitizer tests passed.');
