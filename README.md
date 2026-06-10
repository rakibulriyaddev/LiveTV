# LiveTV

A browser-based live TV streaming app built with Next.js. Loads an M3U playlist, proxies HLS streams, and tracks live viewers per channel in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.9 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Streaming | HLS.js 1.6.16 |
| Language | TypeScript 5 |
| Storage | In-memory (no database) |

---

## Project Structure

```
app/
  layout.tsx              Root layout (metadata, fonts)
  page.tsx                Home page — channel list, search, header, session logic
  globals.css             Tailwind + custom animations
  api/
    viewers/route.ts      Session heartbeat & viewer count API
    proxy/route.ts        HLS stream/playlist proxy

components/
  VideoPlayer.tsx         Video player, carousel, controls

lib/
  parseM3U.ts             M3U playlist parser and Channel data model

public/
  list.txt                M3U playlist (channel source)

scripts/
  check-streams.mjs       Checks which stream URLs are still alive
  filter-bangladeshi.mjs  Filters playlist to Bangladeshi channels only
```

---

## How Channels Are Loaded

### 1. Playlist Source

All channels come from `public/list.txt`, a static M3U8 file bundled with the app. Each entry looks like:

```
#EXTINF:-1 tvg-logo="https://..." group-title="Sports"
T Sports 1
https://cdn.example.com/tsports1/stream.m3u8
```

### 2. Parsing (`lib/parseM3U.ts`)

`parseM3U(text)` reads the file line by line and extracts:

| Field | Source |
|---|---|
| `id` | Sequential index as string (`"0"`, `"1"`, …) |
| `name` | Channel name line after `#EXTINF` |
| `logo` | `tvg-logo="..."` attribute |
| `group` | `group-title="..."` attribute |
| `url` | First `http(s)://` URL after the `#EXTINF` block |
| `type` | Derived from `group` (see below) |

**Type categorization:**

```
"News"          ← group contains "news"
"Movies"        ← contains "movie", "cinema", or starts with "goldmine"
"Music"         ← contains "music", "talkies", "beats", "sangeet"
"Sports"        ← exactly "sports", "live sports", or contains "football"/"cricket"
"Kids"          ← contains "kids", "cartoon", "duronto"
"Religious"     ← contains "religion", "islamic", "peace"
"Entertainment" ← everything else (default)
```

Duplicate entries (same group + name + url) are removed. Channels with the same name are renamed `Channel - 1`, `Channel - 2`, etc.

### 3. Home Page Fetch (`app/page.tsx`)

On mount, the home page:

1. Fetches `/list.txt`
2. Parses it with `parseM3U()`
3. Stores the result in React state (`channels`)
4. Renders the sidebar channel list

Search is a live client-side filter over `channel.name` and `channel.group` (case-insensitive). No server round-trip needed.

---

## Viewer Tracking & Counts

### Session Identity

On first load, `page.tsx` generates a session ID:

```ts
Math.random().toString(36).slice(2) + Date.now().toString(36)
```

This is stored in `sessionStorage` — it survives page refreshes but clears when the browser tab is closed.

### Heartbeat

Every **30 seconds**, and immediately when the user switches channels, the client POSTs to `/api/viewers`:

```json
{
  "sessionId": "abc123xyz789",
  "channelId": "5"
}
```

`channelId` is `null` when the user is on the home screen with no channel selected.

### Server-Side Tracking (`app/api/viewers/route.ts`)

The API stores two in-memory maps:

```
sessions   Map<sessionId → { ts: timestamp, channelId: string | null }>
viewCounts Map<channelId → number>  (cumulative tune-in events, never decrements)
```

On each POST:

1. **Prune** — remove sessions not seen in the last 60 seconds
2. **Detect channel change** — if the session switched to a new channel, increment `viewCounts[newChannelId]`
3. **Upsert session** — update the session's timestamp and current channel

Response:

```json
{
  "total": 42,          // total active sessions across all channels
  "channelCount": 5,    // active sessions on the requested channel (null if no channel)
  "top": [
    { "id": "3", "count": 15 },
    { "id": "1", "count": 12 },
    { "id": "7", "count": 8 }
  ]
}
```

### Count Definitions

| Field | Meaning |
|---|---|
| `total` | Number of sessions active in the last 60 seconds (regardless of channel) |
| `channelCount` | Sessions currently on a specific channel |
| `top[].count` | Cumulative tune-ins for that channel since last server restart |

### Where Counts Are Displayed

- **Header** — `N active` (total viewers, shown only on the home screen)
- **Now Playing bar** — `N watching` (viewers on the current channel)
- **Carousel** — channels are ordered by `top[].count` to surface popular channels

### Important Limitations

- All state is in-memory. Counts reset on server restart.
- Viewer counts are not shared across multiple server instances.
- `viewCounts` tracks tune-in events, not unique viewers.

---

## HLS Stream Proxy (`app/api/proxy`)

Stream URLs are routed through a local proxy to solve CORS restrictions on third-party CDNs.

**Request:**
```
GET /api/proxy?url=https://cdn.example.com/channel1/stream.m3u8
```

The proxy:

1. Forwards the request with browser-like headers (User-Agent, Referer, Origin) to bypass hotlink protection
2. Detects whether the response is an M3U8 playlist or a binary segment
3. **Playlist** — rewrites all relative segment and key URLs to absolute proxied URLs, so subsequent requests also go through the proxy
4. **Segments** — streams binary data directly to the client

The video player points HLS.js at the proxy URL — the app never fetches stream data directly from the CDN.

---

## Video Player (`components/VideoPlayer.tsx`)

### Channel Selected

When a channel is chosen, `VideoPlayer` loads the stream via HLS.js (with native fallback for Safari). It shows:

- The video element with native browser controls
- A **Now Playing** bar at the bottom: logo, channel name, group, viewer count, LIVE badge
- `F` key shortcut to toggle fullscreen

### No Channel Selected — Carousel

When no channel is selected, a carousel of popular channels is shown instead of the video:

- Populated from `topChannelIds` returned by the viewer API
- Always shows at least 5 slots; padded with zero-viewer channels if needed
- Auto-rotates every 4 seconds
- Manual navigation via prev/next buttons and dot indicators
- Clicking a slide selects that channel

---

## UI Layout

```
┌─────────────────────────────────────────────────┐
│ Header: [☰] LiveTV               [N active]     │
├──────────────┬──────────────────────────────────┤
│              │                                  │
│  Sidebar     │   Main Area                      │
│  (channel    │   • No channel: Carousel         │
│   list +     │   • Channel selected: HLS player │
│   search)    │     + Now Playing bar            │
│              │                                  │
└──────────────┴──────────────────────────────────┘
```

On mobile, the sidebar hides when a channel is selected. A "More Channels" button reopens it.

**Keyboard shortcuts:**

| Key | Action |
|---|---|
| `/` | Focus the search input |
| `Escape` | Clear search and blur |
| `F` | Toggle fullscreen (while playing) |

---

## Running the App

```bash
npm install
npm run dev        # dev server on localhost:3000
npm run build      # production build
npm start          # run production build
```

**Utility scripts:**

```bash
node scripts/check-streams.mjs
# Checks each channel URL in list.txt and removes dead streams (concurrent, 6s timeout)

node scripts/filter-bangladeshi.mjs
# Removes non-Bangladeshi channels from list.txt
```

---

## Data Flow Summary

```
Browser                         Server
──────────────────────────────────────────────────────────────────
  Load page
    → fetch /list.txt           ← static file
    → parseM3U()
    → render channel list

  Generate sessionId (sessionStorage)

  POST /api/viewers             → upsert session, count viewers
    ← { total, channelCount,      prune stale sessions (60s TTL)
        top }                      return counts
  (repeat every 30s or on
   channel switch)

  Select channel
    → HLS.js loads
       /api/proxy?url=...       → fetch from CDN (browser headers)
         ← playlist              rewrite URLs in playlist
         ← segments              stream binary data
```
