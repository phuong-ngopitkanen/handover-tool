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

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const db = getDb();
  const acknowledgedAt = new Date().toISOString();
  db.prepare(
    "UPDATE handovers SET acknowledged = 1, acknowledged_at = ? WHERE id = ?"
  ).run(acknowledgedAt, id);

  const row = db.prepare("SELECT * FROM handovers WHERE id = ?").get(id) as
    | HandoverRow
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "Handover not found." }, { status: 404 });
  }

  return NextResponse.json(parseRow(row));
}
