import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPENAI_API_KEY: z.string().min(1),
  OPEN_ASSISTANT_CHAT_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPEN_ASSISTANT_AGENT_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  OPEN_ASSISTANT_ALLOWED_ORIGINS: z.string().default("moz-extension://open-assistant@example.org"),
  OPEN_ASSISTANT_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  OPEN_ASSISTANT_HOST: z.string().default("127.0.0.1"),
  OPEN_ASSISTANT_AUTH_MODE: z.enum(["oidc", "development"]).default("oidc"),
  OPEN_ASSISTANT_OIDC_ISSUER: z.url().optional(),
  OPEN_ASSISTANT_OIDC_AUDIENCE: z.string().min(1).optional(),
});

export type RelayConfig = z.infer<typeof configSchema> & { allowedOrigins: string[] };

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  const parsed = configSchema.parse(environment);
  if (parsed.NODE_ENV === "production" && parsed.OPEN_ASSISTANT_AUTH_MODE !== "oidc") {
    throw new Error("Production relay must use OIDC authentication.");
  }
  if (
    parsed.OPEN_ASSISTANT_AUTH_MODE === "oidc" &&
    (!parsed.OPEN_ASSISTANT_OIDC_ISSUER || !parsed.OPEN_ASSISTANT_OIDC_AUDIENCE)
  ) {
    throw new Error("OIDC issuer and audience are required in OIDC mode.");
  }
  return {
    ...parsed,
    allowedOrigins: parsed.OPEN_ASSISTANT_ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
