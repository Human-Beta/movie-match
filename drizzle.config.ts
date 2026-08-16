import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

import { parseServerEnv } from "./lib/env/server-schema";

config({ path: ".env.local", quiet: true });

const environment = parseServerEnv(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: environment.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
