export type Provider = "spotify" | "apple";

export type UniversalTrack = {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
  providers: Partial<{
    spotify: { id: string; uri?: string; url?: string };
    apple: { id: string; url?: string };
  }>;
};