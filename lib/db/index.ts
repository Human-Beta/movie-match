import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/env/server";

import * as schema from "@/lib/db/schema";

const client = postgres(serverEnv.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
