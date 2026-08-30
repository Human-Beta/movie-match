import "server-only";

import { parseServerEnv } from "@/lib/env/server-schema";

export const serverEnv = parseServerEnv(process.env);
