import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// GLSL lives in JS template strings that get spliced together; a `//` comment there has three times swallowed the
// code after it (a black screen, an invisible gun, a broken texture bake). Shader code must use /* */ comments.
function templateLineComments(src) {
  const hits = []; let i = 0, line = 1, inTpl = false, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') line++;
    if (!inTpl) {
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); for (let k = i; k < j; k++) if (src[k] === '\n') line++; i = j + 2; continue; }
      if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; continue; }
      if (c === '`') { inTpl = true; i++; continue; }
      if (c === '}' && depth > 0) { depth--; if (depth === 0) inTpl = true; }
      i++; continue;
    }
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { inTpl = false; i++; continue; }
    if (c === '$' && src[i + 1] === '{') { inTpl = false; depth = 1; i += 2; continue; }
    if (c === '/' && src[i + 1] === '/' && src[i - 1] !== ':') hits.push(line);
    i++;
  }
  return hits;
}
describe('shader sources', () => {
  for (const f of fs.readdirSync('src').filter(f => f.endsWith('.js') && !f.startsWith('data_'))) {
    it(`${f}: no // comments inside template strings`, () => {
      expect(templateLineComments(fs.readFileSync(path.join('src', f), 'utf8'))).toEqual([]);
    });
  }
});
