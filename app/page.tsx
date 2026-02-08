"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    MusicKit?: any;
  }
}

type NowPlaying = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  isPlaying: boolean;
  source?: "live" | "recent";
  progressMs?: number;
  durationMs?: number;
  url?: string;
};

export default function HomePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [appleConnected, setAppleConnected] = useState<boolean | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [spotifyNow, setSpotifyNow] = useState<NowPlaying | null>(null);
  const [appleNow, setAppleNow] = useState<NowPlaying | null>(null);
  const [nowErr, setNowErr] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [applePlayLoading, setApplePlayLoading] = useState(false);
  const appleProgressRef = useRef<{ time: number; ts: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // simple status check endpoints
  useEffect(() => {
    (async () => {
      const s = await fetch("/api/status", { cache: "no-store" }).then(r => r.json()).catch(() => null);
      if (s) {
        setSpotifyConnected(!!s.spotify);
        setAppleConnected(!!s.apple);
      }
    })();
  }, []);

  useEffect(() => {
    if (!spotifyConnected) return;
    let alive = true;

    async function tick() {
      try {
        const r = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        if (r.status === 204) {
          if (alive) setSpotifyNow(null);
          return;
        }
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? "Spotify now-playing failed");
        if (alive) {
          setSpotifyNow(json?.item ?? null);
          setNowErr(null);
        }
      } catch (e: any) {
        if (alive) setNowErr(e?.message ?? "Now playing error");
      }
    }

    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [spotifyConnected]);

  useEffect(() => {
    if (!appleConnected) return;
    let alive = true;

    async function tick() {
      try {
        const music = await ensureAppleMusic();
        if (!music?.isAuthorized) return;
        const item = music.player?.nowPlayingItem;
        if (!item) {
          const r = await fetch("/api/apple/recent", { cache: "no-store" });
          const json = await r.json();
          if (!r.ok) throw new Error(json?.error ?? "Apple recent failed");
          if (alive) {
            setAppleNow(json?.item ?? null);
            setNowErr(null);
          }
          return;
        }
        if (alive) {
          const playbackTime = music.player?.currentPlaybackTime;
          let isPlaying = music.player?.isPlaying ?? false;
          if (typeof playbackTime === "number") {
            const last = appleProgressRef.current;
            if (last && playbackTime > last.time + 0.1) isPlaying = true;
            appleProgressRef.current = { time: playbackTime, ts: Date.now() };
          }
          setAppleNow({
            id: item.id,
            title: item.title,
            artist: item.artistName,
            album: item.albumName,
            isPlaying,
            source: "live",
            progressMs: typeof playbackTime === "number" ? Math.floor(playbackTime * 1000) : undefined,
            durationMs: item.playbackDuration ? Math.floor(item.playbackDuration * 1000) : undefined,
            url: item.url,
          });
          setNowErr(null);
        }
      } catch (e: any) {
        if (alive) setNowErr(e?.message ?? "Apple now playing error");
      }
    }

    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [appleConnected]);

  async function createRoom() {
    const r = await fetch("/api/rooms", { method: "POST" });
    const room = await r.json();
    router.push(`/rooms/${room.id}`);
  }

  function joinRoom() {
    const id = roomId.trim();
    if (!id) return;
    router.push(`/rooms/${id}`);
  }

  async function connectAppleMusic() {
    setAppleLoading(true);
    try {
      const music = await ensureAppleMusic();
      if (!music) throw new Error("MusicKit not ready");

      // 4) authorize user (shows Apple login prompt)
      const userToken = await music.authorize();

      // 5) store user token in cookie via your API
      await fetch("/api/apple/user-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: userToken }),
      });

      setAppleConnected(true);
    } catch (e: any) {
      alert(e?.message ?? "Apple Music connect failed");
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>Crossplay Rooms</h1>
            <p style={styles.sub}>Simple v1: rooms + auth buttons.</p>
          </div>
        </header>

        <section style={styles.card}>
          <h2 style={styles.h2}>Connections</h2>

          <div style={styles.row}>
            <div style={styles.status}>
              <span style={dot(spotifyConnected)} />
              <div>
                <div style={styles.label}>Spotify</div>
                <div style={styles.small}>
                  {spotifyConnected === null ? "Checking..." : spotifyConnected ? "Connected" : "Not connected"}
                </div>
              </div>
            </div>

            <a href="/api/auth/spotify/login" style={{ ...styles.button, textDecoration: "none", textAlign: "center" }}>
              Connect Spotify
            </a>
          </div>

          <div style={styles.row}>
            <div style={styles.status}>
              <span style={dot(appleConnected)} />
              <div>
                <div style={styles.label}>Apple Music</div>
                <div style={styles.small}>
                  {appleConnected === null ? "Checking..." : appleConnected ? "Connected" : "Not connected"}
                </div>
              </div>
            </div>

            <button
              onClick={connectAppleMusic}
              disabled={appleLoading}
              style={{ ...styles.button, opacity: appleLoading ? 0.7 : 1 }}
            >
              {appleLoading ? "Connecting..." : "Connect Apple Music"}
            </button>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>Currently Listening</h2>

          {nowErr && <div style={styles.small}>{nowErr}</div>}

          <div style={styles.row}>
            <div>
              <div style={styles.label}>Spotify</div>
              <div style={styles.small}>
                {spotifyConnected === false && "Not connected"}
                {spotifyConnected && spotifyNow && formatNowPlaying(spotifyNow, nowTick)}
                {spotifyConnected && !spotifyNow && "No active playback"}
                {spotifyConnected === null && "Checking..."}
              </div>
            </div>
          </div>

          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <div style={styles.label}>Apple Music</div>
              <div style={styles.small}>
                {appleConnected === false && "Not connected"}
                {appleConnected && appleNow && formatNowPlaying(appleNow, nowTick)}
                {appleConnected && !appleNow && "No active playback"}
                {appleConnected === null && "Checking..."}
              </div>
            </div>
            {appleConnected && appleNow?.source === "recent" && appleNow.id && (
              <button
                onClick={async () => {
                  setApplePlayLoading(true);
                  try {
                    const music = await ensureAppleMusic();
                    if (!music) throw new Error("MusicKit not ready");
                    await music.setQueue({ song: appleNow.id });
                    await music.play();
                  } catch (e: any) {
                    setNowErr(e?.message ?? "Apple play failed");
                  } finally {
                    setApplePlayLoading(false);
                  }
                }}
                disabled={applePlayLoading}
                style={{ ...styles.button, opacity: applePlayLoading ? 0.7 : 1 }}
              >
                {applePlayLoading ? "Starting..." : "Play in browser"}
              </button>
            )}
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>Rooms</h2>

          <div style={styles.actions}>
            <button onClick={createRoom} style={styles.primaryButton}>Create room</button>

            <div style={styles.joinWrap}>
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room id"
                style={styles.input}
              />
              <button onClick={joinRoom} style={styles.button}>Join</button>
            </div>
          </div>

          <p style={styles.note}>
            Open the same room in two tabs to test sync.
          </p>
        </section>
      </div>
    </main>
  );
}

function dot(connected: boolean | null) {
  const color = connected === null ? "#999" : connected ? "#16a34a" : "#ef4444";
  return { width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" };
}

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

function formatNowPlaying(np: NowPlaying, tick: number) {
  const main = `${np.title} — ${np.artist}`;
  const album = np.album ? ` (${np.album})` : "";
  const recent = np.source === "recent" ? " • Recent" : "";

  const liveProgress =
    np.isPlaying && typeof np.progressMs === "number"
      ? np.progressMs + tick * 1000
      : np.progressMs;
  const clamped =
    typeof liveProgress === "number" && typeof np.durationMs === "number"
      ? Math.min(liveProgress, np.durationMs)
      : liveProgress;
  const progressLabel =
    typeof clamped === "number"
      ? ` • ${formatMs(clamped)}${typeof np.durationMs === "number" ? ` / ${formatMs(np.durationMs)}` : ""}`
      : "";

  return `${main}${album}${np.isPlaying ? "" : " • Paused"}${recent}${progressLabel}`;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0b0b0f", color: "white" },
  container: { maxWidth: 760, margin: "0 auto", padding: "36px 16px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  h1: { fontSize: 28, fontWeight: 800, margin: 0 },
  sub: { opacity: 0.8, marginTop: 6 },
  card: {
    background: "#11111a",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
  },
  h2: { fontSize: 16, fontWeight: 800, margin: "0 0 12px 0" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0" },
  status: { display: "flex", alignItems: "center", gap: 10 },
  label: { fontWeight: 700 },
  small: { opacity: 0.75, fontSize: 13, marginTop: 2 },
  actions: { display: "flex", flexDirection: "column", gap: 12 },
  joinWrap: { display: "flex", gap: 10 },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b0b0f",
    color: "white",
    outline: "none",
  },
  button: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#151525",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  primaryButton: {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "white",
    color: "black",
    cursor: "pointer",
    fontWeight: 800,
  },
  note: { marginTop: 12, opacity: 0.75, fontSize: 13 },
};
