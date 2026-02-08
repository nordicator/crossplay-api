"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

declare global {
  interface Window {
    MusicKit?: any;
  }
}

type PlaybackState = {
  isPlaying: boolean;
  positionMs: number;
  updatedAtMs: number;
  track?: {
    title: string;
    artist: string;
    durationMs?: number;
    providers?: {
      spotify?: { id: string; uri?: string; url?: string };
      apple?: { id: string; url?: string };
    };
  };
};

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  url?: string;
  provider: "spotify" | "apple";
  uri?: string;
};

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params?.id;
  const [state, setState] = useState<PlaybackState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [appleConnected, setAppleConnected] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<"spotify" | "apple">("spotify");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const lastAppliedRef = useRef<{
    id?: string;
    isPlaying?: boolean;
    positionMs?: number;
    lastQueueAt?: number;
    lastSeekAt?: number;
  }>({});
  const appleActionRef = useRef(Promise.resolve());

  // Poll room state (v1 simple)
  useEffect(() => {
    if (!roomId) return;
    let alive = true;

    async function tick() {
      try {
        const r = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`Room not found (${r.status})`);
        const json = await r.json();
        if (alive) {
          setState(json.state);
          setErr(null);
        }
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Error");
      }
    }

    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [roomId]);

  useEffect(() => {
    (async () => {
      const s = await fetch("/api/status", { cache: "no-store" }).then(r => r.json()).catch(() => null);
      if (s) {
        setSpotifyConnected(!!s.spotify);
        setAppleConnected(!!s.apple);
      }
    })();
  }, []);

  async function send(ev: any) {
    if (!roomId) return;
    const r = await fetch(`/api/rooms/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
    const json = await r.json();
    if (r.ok) setState(json.state);
    if (r.ok && ev?.type === "SEEK" && typeof ev.positionMs === "number") {
      await applyAppleSeek(ev.positionMs);
    }
    return json;
  }

  const posLabel = useMemo(() => {
    if (!state) return "--:--";
    return msToTime(state.positionMs);
  }, [state]);

  useEffect(() => {
    if (!appleConnected) return;
    const appleId = state?.track?.providers?.apple?.id;
    if (!appleId) return;

    const last = lastAppliedRef.current;
    const posDiff =
      typeof last.positionMs === "number" ? Math.abs((state?.positionMs ?? 0) - last.positionMs) : Infinity;
    const shouldApply = appleId !== last.id || state?.isPlaying !== last.isPlaying || posDiff > 5000;
    if (!shouldApply) return;
    lastAppliedRef.current = { ...last, id: appleId, isPlaying: state?.isPlaying, positionMs: state?.positionMs };

    let canceled = false;
    const scheduled = () =>
      (appleActionRef.current = appleActionRef.current.then(async () => {
      try {
        const music = await ensureAppleMusic();
        if (!music?.isAuthorized) return;
        const currentId = music.player?.nowPlayingItem?.id;
        const currentIdStr = currentId ? String(currentId) : null;
        const appleIdStr = String(appleId);
        const now = Date.now();
        const recentlyQueued = lastAppliedRef.current.lastQueueAt && now - lastAppliedRef.current.lastQueueAt < 7000;
        const playbackTime = music.player?.currentPlaybackTime;
        const isPlayingNow = music.player?.isPlaying ?? false;
        const hasPlayback = typeof playbackTime === "number" && playbackTime > 0.5;
        const isTrackChange = currentIdStr ? currentIdStr !== appleIdStr : !hasPlayback;

        if (isTrackChange && !recentlyQueued) {
          lastAppliedRef.current.lastQueueAt = now;
          await music.setQueue({ song: appleIdStr });
        }
        if (state?.isPlaying !== isPlayingNow) {
          if (state?.isPlaying) await music.play();
          else await music.pause();
        }

        const canSeek =
          typeof state?.positionMs === "number" && typeof music.player?.seekToTime === "function";
        const recentlySought = lastAppliedRef.current.lastSeekAt && now - lastAppliedRef.current.lastSeekAt < 4000;
        if (canSeek && !recentlySought) {
          if (isTrackChange) {
            await new Promise((r) => setTimeout(r, 300));
            await music.player.seekToTime(state.positionMs / 1000);
            lastAppliedRef.current.lastSeekAt = Date.now();
          } else if (!state?.isPlaying && posDiff > 1500) {
            await music.player.seekToTime(state.positionMs / 1000);
            lastAppliedRef.current.lastSeekAt = Date.now();
          }
        }
      } catch (e) {
        if (!canceled) {
          // silent fail; playback is best-effort
        }
      }
    }));

    scheduled();

    return () => {
      canceled = true;
    };
  }, [appleConnected, state?.track?.providers?.apple?.id, state?.isPlaying, state?.positionMs]);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const r = await fetch(`/api/${provider}/search?q=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error ?? "Search failed");

      const items: SearchResult[] = [];
      if (provider === "spotify") {
        const list = json?.data?.tracks?.items ?? [];
        for (const it of list) {
          items.push({
            id: it.id,
            title: it.name,
            artist: Array.isArray(it.artists) ? it.artists.map((a: any) => a.name).join(", ") : "",
            album: it.album?.name,
            durationMs: it.duration_ms,
            url: it.external_urls?.spotify,
            provider: "spotify",
            uri: it.uri,
          });
        }
      } else {
        const list = json?.data?.results?.songs?.data ?? [];
        for (const it of list) {
          items.push({
            id: it.id,
            title: it.attributes?.name,
            artist: it.attributes?.artistName,
            album: it.attributes?.albumName,
            durationMs: it.attributes?.durationInMillis,
            url: it.attributes?.url,
            provider: "apple",
          });
        }
      }

      setResults(items);
    } catch (e: any) {
      setSearchErr(e?.message ?? "Search error");
    } finally {
      setSearching(false);
    }
  }

  async function setTrack(r: SearchResult, play: boolean) {
    const track = {
      title: r.title,
      artist: r.artist,
      durationMs: r.durationMs,
      providers:
        r.provider === "spotify"
          ? { spotify: { id: r.id, uri: r.uri, url: r.url } }
          : { apple: { id: r.id, url: r.url } },
    };
    await send({ type: "SET_TRACK", track });
    if (play) await send({ type: "PLAY" });
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Room: {roomId ?? "—"}</h1>
        <a href="/" style={{ opacity: 0.8 }}>← Home</a>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {state?.track ? `${state.track.title} — ${state.track.artist}` : "No track set"}
            </div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Status: {state?.isPlaying ? "Playing" : "Paused"} • Position: {posLabel}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={btn} onClick={() => send({ type: "PLAY" })}>Play</button>
            <button style={btn} onClick={() => send({ type: "PAUSE" })}>Pause</button>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => send({ type: "SEEK", positionMs: Math.max(0, (state?.positionMs ?? 0) - 10_000) })}>-10s</button>
          <button style={btn} onClick={() => send({ type: "SEEK", positionMs: (state?.positionMs ?? 0) + 10_000 })}>+10s</button>

          <button
            style={btn}
            onClick={() =>
              send({
                type: "SET_TRACK",
                track: { title: "Test Song", artist: "Test Artist", durationMs: 180_000 },
              })
            }
          >
            Set test track
          </button>
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Search & Add Track</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Spotify: {spotifyConnected ? "Connected" : "Not connected"} • Apple: {appleConnected ? "Connected" : "Not connected"}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs"
            style={{ ...input, flex: 1, minWidth: 200 }}
          />
          <select value={provider} onChange={(e) => setProvider(e.target.value as any)} style={input}>
            <option value="spotify">Spotify</option>
            <option value="apple">Apple Music</option>
          </select>
          <button style={btn} onClick={runSearch} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {searchErr && <div style={{ color: "crimson", marginTop: 8 }}>{searchErr}</div>}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {results.map((r) => (
            <div key={`${r.provider}:${r.id}`} style={row}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.title} — {r.artist}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  {r.album ?? "—"} • {r.provider === "spotify" ? "Spotify" : "Apple Music"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={() => setTrack(r, false)}>Add</button>
                <button style={btn} onClick={() => setTrack(r, true)}>Add & Play</button>
              </div>
            </div>
          ))}
          {!results.length && <div style={{ opacity: 0.7 }}>No results yet.</div>}
        </div>
      </section>

      <p style={{ opacity: 0.75, marginTop: 14 }}>
        Apple Music playback is synced via MusicKit in-browser. Spotify playback requires a device or Web Playback SDK.
      </p>
    </main>
  );
}

function msToTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const card: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 14,
  padding: 16,
  marginTop: 16,
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "white",
  cursor: "pointer",
  fontWeight: 600,
};

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "white",
  color: "#111",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 10,
};

function loadScriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      const el = existing as HTMLScriptElement;
      if (el.dataset.loaded === "true") return resolve();
      el.addEventListener("load", () => resolve(), { once: true });
      el.addEventListener("error", () => reject(new Error("Failed to load script: " + src)), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = "true";
      resolve();
    };
    s.onerror = () => reject(new Error("Failed to load script: " + src));
    document.head.appendChild(s);
  });
}

async function waitForMusicKit() {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (window.MusicKit) return window.MusicKit;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("MusicKit failed to load");
}

let appleMusicPromise: Promise<any> | null = null;
function ensureAppleMusic() {
  if (!appleMusicPromise) {
    appleMusicPromise = (async () => {
      await loadScriptOnce("https://js-cdn.music.apple.com/musickit/v3/musickit.js");
      const { token: developerToken } = await fetch("/api/apple/developer-token", { cache: "no-store" }).then(r => r.json());
      if (!developerToken) throw new Error("No Apple developer token");
      const MusicKit = await waitForMusicKit();
      MusicKit.configure({
        developerToken,
        app: {
          name: "Crossplay",
          build: "1.0.0",
        },
      });
      const instance = MusicKit.getInstance?.();
      if (!instance) throw new Error("MusicKit instance unavailable");
      return instance;
    })().catch((e) => {
      appleMusicPromise = null;
      throw e;
    });
  }
  return appleMusicPromise;
}

async function applyAppleSeek(positionMs: number) {
  try {
    const music = await ensureAppleMusic();
    if (!music?.isAuthorized) return;
    if (typeof music.player?.seekToTime === "function") {
      await music.player.seekToTime(positionMs / 1000);
    }
  } catch {
    // best-effort
  }
}
