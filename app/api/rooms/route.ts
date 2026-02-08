import { NextResponse } from "next/server";
import { createRoom } from "../../lib/rooms";

export async function POST() {
  const room = createRoom();
  return NextResponse.json(room, { status: 201 });
}