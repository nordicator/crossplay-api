export const env = {
    spotifyAccessToken: process.env.SPOTIFY_ACCESS_TOKEN ?? "",
  
    appleTeamId: process.env.APPLE_TEAM_ID ?? "",
    appleKeyId: process.env.APPLE_KEY_ID ?? "",
    appleMusicKeyP8: process.env.APPLE_MUSIC_KEY_P8 ?? "",
    appleTokenTtlSeconds: Number(process.env.APPLE_MUSIC_TOKEN_TTL_SECONDS ?? "3600"),
    appleStorefront: process.env.APPLE_MUSIC_STOREFRONT ?? "us",
  };