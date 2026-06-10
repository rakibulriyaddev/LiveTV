import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const listPath = join(__dirname, '../public/list.txt');

const content = readFileSync(listPath, 'utf8');
const lines = content.split('\n');

// Parse into blocks: { start, end, url }
const blocks = [];
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim().startsWith('#EXTINF')) continue;
  const start = i;
  let url = null, urlLine = null;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j].trim();
    if (l.startsWith('#EXTINF')) break;
    if (l && !l.startsWith('#') && /^https?:\/\//i.test(l)) {
      url = l;
      urlLine = j;
      break;
    }
  }
  if (url !== null && urlLine !== null) blocks.push({ start, end: urlLine, url });
}

console.log(`Found ${blocks.length} channels. Checking availability…`);

const CONCURRENCY = 25;
const TIMEOUT_MS = 6000;

async function checkUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
    });
    clearTimeout(timer);
    // 404 / 410 = definitely dead; everything else (200, 301, 302, 403, 401) = keep
    return res.status !== 404 && res.status !== 410;
  } catch {
    clearTimeout(timer);
    return false; // network error or timeout
  }
}

// Process in batches
const alive = new Array(blocks.length).fill(true);
let checked = 0;
for (let i = 0; i < blocks.length; i += CONCURRENCY) {
  const batch = blocks.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(b => checkUrl(b.url)));
  results.forEach((ok, j) => { alive[i + j] = ok; });
  checked += batch.length;
  process.stdout.write(`\r  Checked ${checked}/${blocks.length} — dead so far: ${alive.filter(a => !a).length}`);
}
process.stdout.write('\n');

const deadCount = alive.filter(a => !a).length;
console.log(`Dead: ${deadCount}, Alive: ${blocks.length - deadCount}`);

// Build filtered list: mark lines belonging to dead blocks as removed
const keep = new Array(lines.length).fill(true);
for (let i = 0; i < blocks.length; i++) {
  if (!alive[i]) {
    for (let l = blocks[i].start; l <= blocks[i].end; l++) keep[l] = false;
  }
}

const filtered = lines.filter((_, i) => keep[i]).join('\n');
writeFileSync(listPath, filtered);
console.log(`Done. Saved ${blocks.length - deadCount} channels to list.txt`);
