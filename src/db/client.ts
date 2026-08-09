import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

export type KitchenDb = LibSQLDatabase<typeof schema>;

const LOCAL_DB_URL = "file:./data/kitchen.db";

function resolveDbUrl(): string {
  return process.env.TURSO_DATABASE_URL?.trim() || LOCAL_DB_URL;
}

function ensureLocalDataDir(url: string): void {
  if (!url.startsWith("file:")) return;
  const filePath = url.replace(/^file:/, "");
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
}

let client: Client | undefined;
let db: KitchenDb | undefined;

export function getDbClient(): Client {
  if (client) return client;
  const url = resolveDbUrl();
  ensureLocalDataDir(url);
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return client;
}

export function getDb(): KitchenDb {
  if (db) return db;
  db = drizzle(getDbClient(), { schema });
  return db;
}
