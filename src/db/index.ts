import { Database } from "bun:sqlite";
import { DDL } from "./schema.js";

let db: Database | null = null;

export function getDb(dbPath?: string): Database {
  if (db) return db;

  const path = dbPath ?? "claimguard.sqlite";
  db = new Database(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.exec(DDL);
  return db;
}

export function getTestDb(): Database {
  const testDb = new Database(":memory:");
  testDb.exec(DDL);
  return testDb;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
