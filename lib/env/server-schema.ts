import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "is required")
    .url("must be a valid URL")
    .refine(value => ["postgres:", "postgresql:"].includes(new URL(value).protocol), "must use the postgres or postgresql protocol"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(environment: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n");

    throw new Error(`Invalid server environment variables:\n${details}`);
  }

  return result.data;
}
