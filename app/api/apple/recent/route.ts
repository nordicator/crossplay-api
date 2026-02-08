import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const c = await cookies();
  const userToken = c.get("apple_music_user_token")?.value;
  if (!userToken) return NextResponse.json({ error: "Not connected to Apple Music" }, { status: 401 });

  const baseUrl = new URL(req.url).origin;
  const tokRes = await fetch(`${baseUrl}/api/apple/developer-token`, { cache: "no-store" });
  const { token } = await tokRes.json();

  const url = "https://api.music.apple.com/v1/me/recent/played/tracks?limit=1";
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Music-User-Token": userToken,
    },
    cache: "no-store",
  });

  if (!r.ok) {
    const data = await r.json().catch(() => null);
    return NextResponse.json({ error: "Apple Music API error", status: r.status, data }, { status: r.status });
  }

  const data = await r.json();
  const item = data?.data?.[0];
  if (!item) return NextResponse.json({ item: null });

  return NextResponse.json({
    item: {
      id: item.id,
      title: item.attributes?.name,
      artist: item.attributes?.artistName,
      album: item.attributes?.albumName,
      isPlaying: false,
      source: "recent",
      url: item.attributes?.url,
    },
  });
}
