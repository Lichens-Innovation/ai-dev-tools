/**
 * INPUT VALIDATION — Zod
 * Rule: Validate ALL external input (request bodies, query params, env vars).
 *       Never trust data from outside your codebase.
 */

import { z } from "zod";

// ─────────────────────────────────────────────
// SCHEMA DEFINITIONS
// ─────────────────────────────────────────────

// ✅ GOOD — define schemas as constants, reuse for type inference
const CreateMarketSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  description: z.string().min(1).max(2000),
  endDate: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
  category: z.enum(["sports", "politics", "tech", "finance", "other"]),
  initialProbability: z.number().min(0).max(1).optional().default(0.5),
});

const UpdateMarketSchema = CreateMarketSchema.partial().omit({ endDate: true });

const MarketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "resolved", "closed", "all"]).default("all"),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["name", "createdAt", "endDate"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

// ─────────────────────────────────────────────
// TYPE INFERENCE FROM SCHEMAS
// ─────────────────────────────────────────────

// ✅ GOOD — derive types from schemas, single source of truth
type CreateMarketInput = z.infer<typeof CreateMarketSchema>;
type UpdateMarketInput = z.infer<typeof UpdateMarketSchema>;
type MarketQuery = z.infer<typeof MarketQuerySchema>;

// ─────────────────────────────────────────────
// VALIDATION IN HANDLERS
// ─────────────────────────────────────────────

// ✅ GOOD — safe parse returns success/error, no throw
const createMarketHandler = async (body: unknown) => {
  const result = CreateMarketSchema.safeParse(body);

  if (!result.success) {
    return {
      success: false,
      error: "Validation failed",
      details: result.error.flatten().fieldErrors,
    };
  }

  // result.data is fully typed as CreateMarketInput
  const market = await createMarket(result.data);
  return { success: true, data: market };
};

// ✅ GOOD — parse (throws on invalid) for trusted internal use
const processMarketData = (data: unknown): CreateMarketInput =>
  CreateMarketSchema.parse(data);

// ─────────────────────────────────────────────
// ENVIRONMENT VARIABLES VALIDATION
// ─────────────────────────────────────────────

// ✅ GOOD — validate env at startup, fail fast
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_SECRET_KEY: z.string().min(32),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const loadEnv = () => {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
};

export const env = loadEnv(); // Validated and typed

// ─────────────────────────────────────────────
// REUSABLE FIELD SCHEMAS
// ─────────────────────────────────────────────

// ✅ GOOD — build a library of reusable validators
const emailSchema = z.string().email("Invalid email address").toLowerCase();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number");

const uuidSchema = z.string().uuid("Must be a valid UUID");
const positiveIntSchema = z.number().int().positive();
const dateRangeSchema = z
  .object({ start: z.date(), end: z.date() })
  .refine((range) => range.end > range.start, {
    message: "End date must be after start date",
    path: ["end"],
  });

const RegisterUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] }
);

// ─────────────────────────────────────────────
// ERROR FORMATTING FOR CLIENTS
// ─────────────────────────────────────────────

const formatZodError = (error: z.ZodError): Record<string, string[]> =>
  error.flatten().fieldErrors as Record<string, string[]>;

// Usage
const result = RegisterUserSchema.safeParse({ email: "bad", password: "short" });
if (!result.success) {
  const fieldErrors = formatZodError(result.error);
  // { email: ["Invalid email address"], password: ["Must be at least 8 characters", ...] }
}

// Stubs
const createMarket = async (data: CreateMarketInput) =>
  ({ id: "1", ...data });
