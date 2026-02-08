import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const token = (await cookies()).get("spotify_access_token")?.value;
  if (!token) return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });

  const r = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (r.status === 204) return new NextResponse(null, { status: 204 });

  const data = await r.json().catch(() => null);
  if (!r.ok) {
    return NextResponse.json({ error: "Spotify API error", status: r.status, data }, { status: r.status });
  }

  const item = data?.item;
  if (!item) return NextResponse.json({ item: null });

  const artists = Array.isArray(item.artists) ? item.artists.map((a: any) => a.name).join(", ") : "";

  return NextResponse.json({
    item: {
      title: item.name,
      artist: artists,
      album: item.album?.name,
      isPlaying: !!data?.is_playing,
      progressMs: data?.progress_ms,
      durationMs: item.duration_ms,
      url: item.external_urls?.spotify,
    },
  });
}
