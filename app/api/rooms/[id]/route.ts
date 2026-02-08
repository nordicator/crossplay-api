import { NextResponse } from "next/server";
import { applyEvent, getComputedState, getRoom } from "../../../lib/rooms";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = getRoom(id);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json({ room, state: getComputedState(room) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = getRoom(id);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  let ev: any = null;
  try {
    ev = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!ev || typeof ev.type !== "string") {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  applyEvent(room, ev);
  return NextResponse.json({ room, state: getComputedState(room) });
}
