import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const listPath = join(__dirname, '../public/list.txt');

// Groups that identify non-Bangladeshi content
const REMOVE_PATTERNS = [
  /^hindi$/i,
  /^hindi\s/i,
  /^indian$/i,
  /^indian\s/i,
  /^kolkata/i,
  /^cartoon\s*drama$/i,
  /^english\s*(movies?|music|news)$/i,
  /^goldmine/i,
];

function shouldRemove(group) {
  return REMOVE_PATTERNS.some(re => re.test(group.trim()));
}

const content = readFileSync(listPath, 'utf8');
const lines = content.split('\n');
const keep = new Array(lines.length).fill(true);
let removed = 0;

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim().startsWith('#EXTINF')) continue;
  const m = lines[i].match(/group-title="([^"]*)"/i);
  const group = m ? m[1] : '';
  if (!shouldRemove(group)) continue;
  keep[i] = false;
  removed++;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j].trim();
    if (l.startsWith('#EXTINF')) break;
    keep[j] = false;
    if (l && !l.startsWith('#') && /^https?:\/\//i.test(l)) break;
  }
}

const filtered = lines.filter((_, i) => keep[i]).join('\n');
writeFileSync(listPath, filtered);
console.log(`Removed ${removed} channels. Remaining saved to list.txt`);
