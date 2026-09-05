import "server-only";

export type Database = (typeof import("@/lib/db"))["db"];
export type DatabaseProvider = () => Promise<Database>;

export async function loadDatabase(): Promise<Database> {
  const { db } = await import("@/lib/db");

  return db;
}
