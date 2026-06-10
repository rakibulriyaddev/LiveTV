export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  type: string;
}

function getType(group: string): string {
  const g = group.toLowerCase().trim();
  if (g.includes('news')) return 'News';
  if (g.includes('movie') || g.includes('cinema') || g.startsWith('goldmine')) return 'Movies';
  if (g.includes('music') || g.includes('talkies') || g.includes('beats') || g.includes('sangeet')) return 'Music';
  if (
    g === 'sports' ||
    g === 'live sports' ||
    g.includes('football') ||
    g === 'bijoy' ||
    g.includes('cricket')
  ) return 'Sports';
  if (g === 'kids' || g.includes('cartoon') || g.includes('duronto')) return 'Kids';
  if (
    g.includes('relagion') ||
    g.includes('religion') ||
    g === 'islamic' ||
    g.includes('peace')
  ) return 'Religious';
  return 'Entertainment';
}

export function parseM3U(content: string): Channel[] {
  const lines = content.split('\n').map(l => l.trim());
  const channels: Channel[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXTINF')) continue;

    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const logo = logoMatch ? logoMatch[1] : '';

    const groupMatch = line.match(/group-title="([^"]*)"/);
    const group = groupMatch ? groupMatch[1].trim() : 'Other';

    const lastComma = line.lastIndexOf(',');
    const name = lastComma >= 0 ? line.slice(lastComma + 1).trim() : '';
    if (!name) continue;

    // Take the first valid HTTP URL after this #EXTINF line
    let url = '';
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.startsWith('#EXTINF')) break;
      if (next && !next.startsWith('#') && /^https?:\/\//.test(next)) {
        url = next;
        break;
      }
    }
    if (!url) continue;

    const key = `${group}||${name}||${url}`;
    if (!seen.has(key)) {
      seen.add(key);
      channels.push({
        id: String(channels.length),
        name,
        logo,
        group,
        url,
        type: getType(group),
      });
    }
  }

  // Number duplicate names: "Channel" → "Channel - 1", "Channel - 2", …
  const nameCount = new Map<string, number>();
  for (const ch of channels) nameCount.set(ch.name, (nameCount.get(ch.name) ?? 0) + 1);

  const nameCursor = new Map<string, number>();
  for (const ch of channels) {
    if ((nameCount.get(ch.name) ?? 1) > 1) {
      const n = (nameCursor.get(ch.name) ?? 0) + 1;
      nameCursor.set(ch.name, n);
      ch.name = `${ch.name} - ${n}`;
    }
  }

  return channels;
}
