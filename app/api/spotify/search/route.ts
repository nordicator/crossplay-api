import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const limit = searchParams.get("limit") ?? "5";
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const token = (await cookies()).get("spotify_access_token")?.value;
  if (!token) return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${encodeURIComponent(limit)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await r.json();
  return NextResponse.json({ ok: r.ok, status: r.status, data });
}