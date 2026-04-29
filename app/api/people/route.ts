import { NextResponse } from "next/server";
import { getDb, type PersonRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, created_at FROM people ORDER BY name ASC")
    .all() as PersonRow[];
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "name must be 100 characters or fewer." }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id, name, created_at FROM people WHERE LOWER(name) = LOWER(:name)")
    .get({ name }) as PersonRow | undefined;
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO people (name, created_at) VALUES (:name, :created_at)")
    .run({ name, created_at: createdAt });

  const inserted = db
    .prepare("SELECT id, name, created_at FROM people WHERE id = :id")
    .get({ id: result.lastInsertRowid }) as PersonRow | undefined;

  if (!inserted) {
    return NextResponse.json({ error: "Insert failed." }, { status: 500 });
  }
  return NextResponse.json(inserted, { status: 201 });
}
