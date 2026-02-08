import { NextResponse } from "next/server";
import { env } from "../../../lib/env";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const limit = searchParams.get("limit") ?? "5";

  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  // Fetch a fresh developer token from our own endpoint
  const baseUrl = new URL(req.url).origin;
  const tokRes = await fetch(`${baseUrl}/api/apple/developer-token`, { cache: "no-store" });
  const { token } = await tokRes.json();

  const url = `https://api.music.apple.com/v1/catalog/${encodeURIComponent(
    env.appleStorefront
  )}/search?term=${encodeURIComponent(q)}&types=songs&limit=${encodeURIComponent(limit)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await r.json();
  return NextResponse.json({ ok: r.ok, status: r.status, data });
}