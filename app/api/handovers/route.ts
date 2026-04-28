import { NextResponse } from "next/server";
import { generateTicketId, getDb, type HandoverRow } from "@/lib/db";

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

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM handovers ORDER BY created_at DESC")
    .all() as HandoverRow[];

  return NextResponse.json(rows.map(parseRow));
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    from_person?: string;
    to_person?: string;
    on_call_person?: string;
    filename?: string;
    what_happened?: string;
    watch_out?: string;
    next_steps?: string[];
    open_items?: string[];
    people_involved?: string[];
  };

  const fromPerson = body.from_person?.trim() ?? "";
  const toPerson = body.to_person?.trim() ?? "";
  const title = body.title?.trim() ?? "";
  const onCallPerson = body.on_call_person?.trim() ?? "";
  const filename = body.filename?.trim() ?? "";
  const whatHappened = body.what_happened?.trim() ?? "";
  const watchOut = body.watch_out?.trim() ?? "";
  const nextSteps = Array.isArray(body.next_steps)
    ? body.next_steps.filter((item): item is string => typeof item === "string")
    : [];
  const openItems = Array.isArray(body.open_items)
    ? body.open_items.filter((item): item is string => typeof item === "string")
    : [];
  const peopleInvolved = Array.isArray(body.people_involved)
    ? body.people_involved.filter((item): item is string => typeof item === "string")
    : [];

  if (!title || !fromPerson || !toPerson || !filename || !whatHappened || !watchOut) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (fromPerson.length > 100 || toPerson.length > 100) {
    return NextResponse.json(
      { error: "from_person and to_person must be 100 characters or fewer." },
      { status: 400 }
    );
  }

  const createdAt = new Date().toISOString();
  const db = getDb();
  const ticketId = generateTicketId(db);
  const mergedPeople = [
    ...new Set(
      [...peopleInvolved, fromPerson, toPerson, onCallPerson]
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];
  const insert = db.prepare(
    `INSERT INTO handovers
      (ticket_id, title, from_person, to_person, people_involved, on_call_person, filename, what_happened, watch_out, next_steps, open_items, created_at)
      VALUES (:ticket_id, :title, :from_person, :to_person, :people_involved, :on_call_person, :filename, :what_happened, :watch_out, :next_steps, :open_items, :created_at)`
  );

  const result = insert.run({
    ticket_id: ticketId,
    title,
    from_person: fromPerson,
    to_person: toPerson,
    people_involved: JSON.stringify(mergedPeople),
    on_call_person: onCallPerson,
    filename,
    what_happened: whatHappened,
    watch_out: watchOut,
    next_steps: JSON.stringify(nextSteps),
    open_items: JSON.stringify(openItems),
    created_at: createdAt,
  });
  const newId = Number(result.lastInsertRowid);

  db.prepare(
    `INSERT INTO events (handover_id, event_type, actor, description, created_at)
     VALUES (:handover_id, :event_type, :actor, :description, :created_at)`
  ).run({
    handover_id: newId,
    event_type: "submitted",
    actor: fromPerson,
    description: `Handover submitted for ${fromPerson} → ${toPerson}`,
    created_at: new Date().toISOString(),
  });

  const tagEventInsert = db.prepare(
    `INSERT INTO events (handover_id, event_type, actor, description, created_at)
     VALUES (:handover_id, :event_type, :actor, :description, :created_at)`
  );
  for (const name of mergedPeople) {
    tagEventInsert.run({
      handover_id: newId,
      event_type: "person_tagged",
      actor: fromPerson,
      description: `${name} was tagged in this handover`,
      created_at: new Date().toISOString(),
    });
  }

  const inserted = db
    .prepare("SELECT * FROM handovers WHERE id = :id")
    .get({ id: result.lastInsertRowid }) as HandoverRow | undefined;

  if (!inserted) {
    return NextResponse.json({ error: "Insert failed." }, { status: 500 });
  }

  return NextResponse.json(parseRow(inserted), { status: 201 });
}
