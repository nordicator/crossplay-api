// In-memory store (resets on redeploy). Perfect for v1 testing.
export type PlaybackState = {
    isPlaying: boolean;
    positionMs: number;        // last known position
    updatedAtMs: number;       // server timestamp when positionMs was set
    track?: {
      title: string;
      artist: string;
      durationMs?: number;
      providers?: {
        spotify?: { id: string; uri?: string; url?: string };
        apple?: { id: string; url?: string };
      };
    };
  };
  
  export type Room = {
    id: string;
    createdAtMs: number;
    state: PlaybackState;
  };
  
const globalRooms = globalThis as unknown as { __rooms?: Map<string, Room> };
const rooms = globalRooms.__rooms ?? (globalRooms.__rooms = new Map<string, Room>());
  
  function id() {
    // simple id for v1
    return Math.random().toString(36).slice(2, 10);
  }
  
  export function createRoom(): Room {
    const room: Room = {
      id: id(),
      createdAtMs: Date.now(),
      state: {
        isPlaying: false,
        positionMs: 0,
        updatedAtMs: Date.now(),
      },
    };
    rooms.set(room.id, room);
    return room;
  }
  
  export function getRoom(roomId: string): Room | null {
    return rooms.get(roomId) ?? null;
  }
  
  // “Authoritative” current position calculation
  export function getComputedState(room: Room): PlaybackState {
    const s = room.state;
    if (!s.isPlaying) return s;
  
    const now = Date.now();
    const elapsed = Math.max(0, now - s.updatedAtMs);
    const duration = s.track?.durationMs ?? Infinity;
    const pos = Math.min(duration, s.positionMs + elapsed);
  
    return {
      ...s,
      positionMs: pos,
      // keep updatedAtMs unchanged here (it's the anchor)
    };
  }
  
  export type RoomEvent =
    | { type: "PLAY" }
    | { type: "PAUSE" }
    | { type: "SEEK"; positionMs: number }
    | { type: "SET_TRACK"; track: PlaybackState["track"] };
  
  export function applyEvent(room: Room, ev: RoomEvent) {
    const now = Date.now();
    const current = getComputedState(room);
  
    switch (ev.type) {
      case "PLAY":
        room.state = { ...current, isPlaying: true, updatedAtMs: now };
        return;
      case "PAUSE":
        room.state = { ...current, isPlaying: false, updatedAtMs: now };
        return;
      case "SEEK":
        room.state = {
          ...current,
          positionMs: Math.max(0, Math.floor(ev.positionMs)),
          updatedAtMs: now,
        };
        return;
      case "SET_TRACK":
        room.state = {
          isPlaying: false,
          positionMs: 0,
          updatedAtMs: now,
          track: ev.track,
        };
        return;
    }
  }
