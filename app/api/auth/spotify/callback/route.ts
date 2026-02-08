import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body,
  });

  const data = await r.json();
  if (!r.ok) return NextResponse.json({ error: "Token exchange failed", data }, { status: 400 });

  // Store token in cookie (v1 simple)
  const res = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_BASE_URL));
  res.cookies.set("spotify_access_token", data.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: data.expires_in ?? 3600,
  });

  // You’ll eventually want refresh tokens too, but v1 can skip.
  return res;
}