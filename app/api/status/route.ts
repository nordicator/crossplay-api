import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const c = await cookies();
  const spotify = !!c.get("spotify_access_token")?.value;
  const apple = !!c.get("apple_music_user_token")?.value;
  return NextResponse.json({ spotify, apple });
}
