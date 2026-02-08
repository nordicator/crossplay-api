import { NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { env } from "../../../lib/env";

export async function GET() {
  if (!env.appleTeamId || !env.appleKeyId || !env.appleMusicKeyP8) {
    return NextResponse.json(
      { error: "Missing APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_MUSIC_KEY_P8 env vars" },
      { status: 500 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.min(Math.max(env.appleTokenTtlSeconds, 300), 6 * 60 * 60);

  const key = await importPKCS8(env.appleMusicKeyP8.replace(/\\n/g, "\n"), "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.appleKeyId })
    .setIssuer(env.appleTeamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  return NextResponse.json({ token, exp });
}