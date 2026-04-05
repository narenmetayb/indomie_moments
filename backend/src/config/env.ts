import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    (val) => {
      const v = val === "" || val === undefined ? undefined : val;
      if (v === "development" || v === "production" || v === "local") return v;
      return undefined;
    },
    z.enum(["development", "production", "local"]).default("development"),
  ),
  PORT: z.preprocess((val) => {
    if (val === "" || val === undefined) return undefined;
    const n = Number(val);
    return Number.isNaN(n) ? undefined : val;
  }, z.coerce.number().int().min(1).default(8080)),

  // Database: either full connection string or individual vars
  DB_CONNECTION_STRING: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_CONNECT_SSL_REQUIRED: z.string().optional(),

  // JWT (required for admin; at least one for consumer)
  JWT_ADMIN_SECRET: z.string().min(1).optional(),
  JWT_CONSUMER_SECRET: z.string().optional(),
  JWT_USER_SECRET: z.string().optional(),
  JWT_ADMIN_REFRESH_SECRET: z.string().optional(),
  JWT_CONSUMER_REFRESH_SECRET: z.string().optional(),

  // App
  FRONTEND_URL: z.string().optional(),
  PROMO_START_DATE: z.string().optional(),

  // Azure (optional for uploads)
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER_NAME: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_KEY: z.string().optional(),

  // Termii SMS (optional)
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().optional(),

  // SMTP (optional – for admin password reset emails)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.preprocess((val) => {
    if (val === "" || val === undefined) return undefined;
    const n = Number(val);
    return Number.isNaN(n) ? undefined : val;
  }, z.coerce.number().int().default(587)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@indomie.com"),

  // External API (optional)
  API_TOKEN: z.string().optional(),

  // Timezone (IANA format, e.g. "Africa/Lagos")
  TIMEZONE: z.string().default("Africa/Lagos"),

  // Test mode – skip real SMS, use fixed OTP "123456"
  OTP_TEST_MODE: z.preprocess(
    (val) => val === "true" || val === "1",
    z.boolean().default(false),
  ),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  BACKEND_URL: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  FACEBOOK_CALLBACK_URL: z.string().optional(),
});

const raw = envSchema.safeParse(process.env);

if (!raw.success) {
  const msg =
    "Invalid environment variables: " +
    raw.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  console.error(msg);
  process.exit(1);
}

const env = raw.data;
function getDatabaseUrl(): string {
  if (env.DB_CONNECTION_STRING) return env.DB_CONNECTION_STRING;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const user = env.DB_USER ?? "";
  const password = env.DB_PASSWORD ?? "";
  const host = env.DB_HOST ?? "localhost";
  const port = env.DB_PORT ?? "5432";
  const name = env.DB_NAME ?? "indomie";
  const ssl = env.DB_CONNECT_SSL_REQUIRED === "true" ? "?sslmode=require" : "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}${ssl}`;
}

function getJwtConsumerSecret(): string {
  return (
    env.JWT_CONSUMER_SECRET ?? env.JWT_USER_SECRET ?? env.JWT_ADMIN_SECRET ?? ""
  );
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  isDevelopment: env.NODE_ENV === "development",
  isProduction: env.NODE_ENV === "production",
  otpTestMode: env.OTP_TEST_MODE,
  timezone: env.TIMEZONE,
  corsOrigin: env.FRONTEND_URL,

  database: {
    connectionString: getDatabaseUrl(),
  },
  jwt: {
    adminSecret: env.JWT_ADMIN_SECRET ?? "",
    consumerSecret: getJwtConsumerSecret(),
    adminRefreshSecret:
      env.JWT_ADMIN_REFRESH_SECRET ?? env.JWT_ADMIN_SECRET ?? "",
    consumerRefreshSecret:
      env.JWT_CONSUMER_REFRESH_SECRET ?? getJwtConsumerSecret(),
  },

  app: {
    frontendBaseUrl: (env.FRONTEND_URL || "http://localhost:5173").replace(
      /\/+$/,
      "",
    ),
    promoStartDate: env.PROMO_START_DATE
      ? new Date(env.PROMO_START_DATE)
      : new Date("2026-01-01"),
    cookieNames: {
      adminAccess: "admin_access_token",
      adminRefresh: "admin_refresh_token",
      // Align with existing frontend / infra cookie name
      userAccess: "user_token",
      userRefresh: "user_refresh_token",
    } as const,
cookieOptions: (secure: boolean, maxAgeSeconds?: number) => ({
  httpOnly: true,
  secure,
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  maxAge: (maxAgeSeconds ?? 15 * 60) * 1000,
  path: "/",
}),
refreshCookieOptions: (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
}),
  },

  azure: {
    connectionString: env.AZURE_STORAGE_CONNECTION_STRING ?? "",
    containerName: env.AZURE_STORAGE_CONTAINER_NAME ?? "uploads",
    accountName: env.AZURE_STORAGE_ACCOUNT_NAME ?? "",
    accountKey: env.AZURE_STORAGE_ACCOUNT_KEY,
  },

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  termii: {
    apiKey: env.TERMII_API_KEY,
    senderId: env.TERMII_SENDER_ID,
    baseUrl: "https://v3.api.termii.com",
  },

  apiToken: env.API_TOKEN,

  social: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      callbackUrl: env.GOOGLE_CALLBACK_URL || `${env.BACKEND_URL || "http://localhost:8080"}/api/auth/google/callback`,
    },
    facebook: {
      appId: env.FACEBOOK_APP_ID || "",
      appSecret: env.FACEBOOK_APP_SECRET || "",
      callbackUrl: env.FACEBOOK_CALLBACK_URL || `${env.BACKEND_URL || "http://localhost:8080"}/api/auth/facebook/callback`,
    },
  },
} as const;
function validateConfig(): void {
  const errors: string[] = [];
  if (!config.jwt.adminSecret) errors.push("JWT_ADMIN_SECRET is required");
  if (!config.jwt.consumerSecret)
    errors.push(
      "At least one of JWT_CONSUMER_SECRET, JWT_USER_SECRET, or JWT_ADMIN_SECRET is required for consumer auth",
    );
  if (errors.length > 0) {
    console.error("Configuration validation failed:\n" + errors.join("\n"));
    process.exit(1);
  }
}
validateConfig();
