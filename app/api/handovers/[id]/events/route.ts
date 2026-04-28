import { NextResponse } from "next/server";
import { getDb, type EventRow } from "@/lib/db";

export const runtime = "nodejs";

function getIdFromParam(idParam: string) {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = getIdFromParam(idParam);
  if (!id) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const rows = getDb()
    .prepare("SELECT * FROM events WHERE handover_id = :handover_id ORDER BY created_at ASC")
    .all({ handover_id: id }) as EventRow[];
  return NextResponse.json(rows);
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
    handover_id?: number;
    event_type?: string;
    actor?: string;
    description?: string;
  };
  const eventType = body.event_type?.trim() ?? "";
  if (!eventType) {
    return NextResponse.json({ error: "event_type is required." }, { status: 400 });
  }

  const actor = body.actor?.trim() ?? "";
  const description = body.description?.trim() ?? "";
  if (actor.length > 100) {
    return NextResponse.json({ error: "actor must be 100 characters or fewer." }, { status: 400 });
  }
  if (description.length > 5000) {
    return NextResponse.json(
      { error: "description must be 5000 characters or fewer." },
      { status: 400 }
    );
  }
  if (eventType === "update_added" && (!actor || !description)) {
    return NextResponse.json(
      { error: "actor and description are required for update_added." },
      { status: 400 }
    );
  }

  const db = getDb();
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      "INSERT INTO events (handover_id, event_type, actor, description, created_at) VALUES (:handover_id, :event_type, :actor, :description, :created_at)"
    )
    .run({
      handover_id: id,
      event_type: eventType,
      actor,
      description,
      created_at: createdAt,
    });

  const inserted = db
    .prepare("SELECT * FROM events WHERE id = :id")
    .get({ id: result.lastInsertRowid }) as EventRow | undefined;
  if (!inserted) {
    return NextResponse.json({ error: "Insert failed." }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 201 });
}
