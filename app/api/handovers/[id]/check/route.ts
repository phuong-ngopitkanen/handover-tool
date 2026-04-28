import { NextResponse } from "next/server";
import { getDb, type EventRow } from "@/lib/db";

export const runtime = "nodejs";

function getIdFromParam(idParam: string) {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = getIdFromParam(idParam);
  if (!id) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const body = (await request.json()) as {
    actor?: string;
    item?: string;
    itemType?: "next_step" | "open_item";
    comment?: string;
  };
  const actor = body.actor?.trim() ?? "";
  const item = body.item?.trim() ?? "";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!actor || !item) {
    return NextResponse.json({ error: "actor and item are required." }, { status: 400 });
  }

  const description = comment
    ? `${actor} checked off: ${item} — ${comment}`
    : `${actor} checked off: ${item}`;

  const createdAt = new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO events (handover_id, event_type, actor, description, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, "item_checked", actor, description, createdAt);

  const inserted = db
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(result.lastInsertRowid) as EventRow | undefined;
  if (!inserted) {
    return NextResponse.json({ error: "Insert failed." }, { status: 500 });
  }
  return NextResponse.json(inserted, { status: 201 });
}
