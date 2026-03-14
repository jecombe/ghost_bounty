import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().default("postgres://ghostbounty:ghostbounty@localhost:5432/ghostbounty"),
  RPC_URL: z.string().url(),
  WS_RPC_URL: z.string().optional(),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  DEPLOY_BLOCK: z.coerce.number().int().nonnegative().default(10438838),
  BATCH_SIZE: z.coerce.number().int().positive().default(10000),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    process.exit(1);
  }
  return result.data;
}
