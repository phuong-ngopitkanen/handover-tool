import { NextResponse } from "next/server";
import { getDb, type HandoverRow } from "@/lib/db";

export const runtime = "nodejs";

type Handover = Omit<HandoverRow, "open_items" | "next_steps" | "people_involved"> & {
  open_items: string[];
  next_steps: string[];
  people_involved: string[];
};

function parseRow(row: HandoverRow): Handover {
  return {
    ...row,
    people_involved: JSON.parse(row.people_involved) as string[],
    next_steps: JSON.parse(row.next_steps) as string[],
    open_items: JSON.parse(row.open_items) as string[],
  };
}

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

  const row = getDb().prepare("SELECT * FROM handovers WHERE id = :id").get({ id }) as
    | HandoverRow
    | undefined;

  if (!row) {
    return NextResponse.json({ error: "Handover not found." }, { status: 404 });
  }

  return NextResponse.json(parseRow(row));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = getIdFromParam(idParam);

  if (!id) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const db = getDb();
  const body = (await request.json().catch(() => ({}))) as { acknowledgedBy?: string };
  const acknowledgedBy = body.acknowledgedBy?.trim() || "Unknown";
  const acknowledgedAt = new Date().toISOString();
  db.prepare(
    "UPDATE handovers SET acknowledged = 1, acknowledged_at = :acknowledged_at WHERE id = :id"
  ).run({ acknowledged_at: acknowledgedAt, id });
  db.prepare(
    `INSERT INTO events (handover_id, event_type, actor, description, created_at)
     VALUES (:handover_id, :event_type, :actor, :description, :created_at)`
  ).run({
    handover_id: id,
    event_type: "acknowledged",
    actor: acknowledgedBy,
    description: `${acknowledgedBy} acknowledged this handover`,
    created_at: new Date().toISOString(),
  });

  const row = db.prepare("SELECT * FROM handovers WHERE id = :id").get({ id }) as
    | HandoverRow
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "Handover not found." }, { status: 404 });
  }

  return NextResponse.json(parseRow(row));
}
