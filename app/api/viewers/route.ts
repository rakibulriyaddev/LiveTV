import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface SessionData {
  ts: number;
  channelId: string | null;
}

// sessionId → { ts, channelId }
const sessions = new Map<string, SessionData>();
const TTL = 60_000;

function prune() {
  const cutoff = Date.now() - TTL;
  for (const [id, data] of sessions) {
    if (data.ts < cutoff) sessions.delete(id);
  }
}

function channelCount(channelId: string): number {
  let n = 0;
  for (const data of sessions.values()) {
    if (data.channelId === channelId) n++;
  }
  return n;
}

export async function POST(req: Request) {
  let channelId: string | null = null;
  try {
    const body = await req.json() as { sessionId?: unknown; channelId?: unknown };
    if (typeof body.sessionId === 'string' && body.sessionId) {
      channelId = typeof body.channelId === 'string' && body.channelId ? body.channelId : null;
      prune();
      sessions.set(body.sessionId, { ts: Date.now(), channelId });
    }
  } catch {
    // malformed body — still return counts
  }
  prune();
  return NextResponse.json({
    total: sessions.size,
    channelCount: channelId !== null ? channelCount(channelId) : null,
  });
}

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get('channelId');
  prune();
  return NextResponse.json({
    total: sessions.size,
    channelCount: cid ? channelCount(cid) : null,
  });
}
