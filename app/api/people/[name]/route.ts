import { NextResponse } from "next/server";
import { getDb, type EventRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName).trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const db = getDb();
  const likeName = `%${name}%`;
  const likeAtName = `%@${name}%`;
  const events = db
    .prepare(
      `SELECT e.*, h.ticket_id
            , h.title
       FROM events e
       JOIN handovers h ON h.id = e.handover_id
       WHERE e.event_type != 'followup_added'
         AND (
           LOWER(TRIM(e.actor)) = LOWER(?)
           OR LOWER(COALESCE(e.description, '')) LIKE LOWER(?)
           OR LOWER(COALESCE(e.description, '')) LIKE LOWER(?)
         )
       ORDER BY e.created_at ASC`
    )
    .all(name, likeName, likeAtName) as (EventRow & { ticket_id: string })[];

  return NextResponse.json({
    name,
    events,
  });
}
