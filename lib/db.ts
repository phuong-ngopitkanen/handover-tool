import Database from "better-sqlite3";
import path from "node:path";

let dbInstance: Database.Database | null = null;

export type HandoverRow = {
  id: number;
  ticket_id: string;
  title: string;
  from_person: string;
  to_person: string;
  people_involved: string;
  on_call_person: string;
  filename: string;
  what_happened: string;
  watch_out: string;
  next_steps: string;
  open_items: string;
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
};

export type EventRow = {
  id: number;
  handover_id: number;
  event_type: string;
  actor: string | null;
  description: string | null;
  created_at: string;
};

export function generateTicketId(db: Database.Database): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const datePrefix = `${yyyy}-${mm}-${dd}`;
  const compactDate = `${yyyy}${mm}${dd}`;

  const row = db
    .prepare("SELECT COUNT(*) as count FROM handovers WHERE created_at LIKE ?")
    .get(`${datePrefix}%`) as { count: number };
  const sequence = String(row.count + 1).padStart(3, "0");
  return `HO-${compactDate}-${sequence}`;
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.NODE_ENV === "production"
    ? "/tmp/handovers.db"
    :path.join(process.cwd(), "handovers.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      from_person TEXT NOT NULL,
      to_person TEXT NOT NULL,
      people_involved TEXT NOT NULL DEFAULT '[]',
      on_call_person TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      what_happened TEXT NOT NULL,
      watch_out TEXT NOT NULL,
      next_steps TEXT NOT NULL DEFAULT '[]',
      open_items TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  const columns = db
    .prepare("PRAGMA table_info(handovers)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("on_call_person")) {
    db.exec(
      "ALTER TABLE handovers ADD COLUMN on_call_person TEXT NOT NULL DEFAULT ''"
    );
  }

  if (!columnNames.has("next_steps")) {
    db.exec("ALTER TABLE handovers ADD COLUMN next_steps TEXT NOT NULL DEFAULT '[]'");
  }

  if (!columnNames.has("ticket_id")) {
    db.exec("ALTER TABLE handovers ADD COLUMN ticket_id TEXT NOT NULL DEFAULT ''");
  }

  if (!columnNames.has("people_involved")) {
    db.exec(
      "ALTER TABLE handovers ADD COLUMN people_involved TEXT NOT NULL DEFAULT '[]'"
    );
  }

  if (!columnNames.has("title")) {
    db.exec("ALTER TABLE handovers ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }

  db.exec("DROP TABLE IF EXISTS followups");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handover_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT,
      description TEXT,
      created_at TEXT NOT NULL
    )
  `);

  dbInstance = db;
  return dbInstance;
}
