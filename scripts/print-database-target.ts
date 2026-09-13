import { config } from "dotenv";

import { parseServerEnv } from "@/lib/env/server-schema";

config({ path: ".env.local", quiet: true });

const { DATABASE_URL } = parseServerEnv(process.env);
const target = new URL(DATABASE_URL);
const databaseName = target.pathname.slice(1);

if (databaseName.length === 0) {
  throw new Error("DATABASE_URL must include a database name.");
}

process.stdout.write(`Database target: host=${target.hostname}, database=${databaseName}\n`);
