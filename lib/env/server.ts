import "server-only";

import { parseServerEnv } from "./server-schema";

export const serverEnv = parseServerEnv(process.env);
