import { z } from 'zod';
import { isAbsolute } from 'node:path';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const enabledString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const optionalBooleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

const aiModel = z.enum(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);

const aiReasoningEffort = z
  .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
  .default('medium');

const corsOrigins = z
  .string()
  .default('http://localhost:3000')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()).min(1).max(20))
  .superRefine((origins, context) => {
    origins.forEach((origin, index) => {
      try {
        const url = new URL(origin);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.origin !== origin ||
          origin === '*'
        ) {
          context.addIssue({
            code: 'custom',
            path: [index],
            message: 'debe ser un origen HTTP(S) exacto, sin ruta ni comodín',
          });
        }
      } catch {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'debe ser un origen HTTP(S) válido',
        });
      }
    });
  });

function isUnsafeProductionPassword(urlValue: string): boolean {
  const password = new URL(urlValue).password;
  return (
    password.length < 16 || /replace[-_ ]?with|change[-_ ]?me/i.test(password)
  );
}

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    API_PREFIX: z
      .string()
      .regex(/^[a-z0-9][a-z0-9/_-]*$/i)
      .max(100)
      .default('api/v1'),
    DEFAULT_TENANT_CODE: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .min(2)
      .max(40)
      .default('mood'),
    DATABASE_URL: z.string().url(),
    CORS_ORIGINS: corsOrigins,
    PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
    JWT_ACCESS_SECRET: z.string().min(32).max(512),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(3_600)
      .default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(14),
    LOGIN_ALIAS_PEPPER: z.string().min(32).max(512),
    COOKIE_SECURE: booleanString,
    TRUST_PROXY: booleanString,
    REDIS_URL: z.string().url().default('redis://localhost:63799'),
    SWAGGER_ENABLED: optionalBooleanString,
    TITLE_EVALUATION_WORKER_ENABLED: enabledString,
    TITLE_EVALUATION_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .default(2),
    TITLE_EVALUATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000),
    NOTE_QA_WORKER_ENABLED: enabledString,
    NOTE_QA_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
    NOTE_QA_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000),
    EXPORT_WORKER_ENABLED: enabledString,
    EXPORT_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
    EXPORT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(120_000),
    EXPORT_STORAGE_DIR: z.string().min(1).max(1_000).default('storage/exports'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(10_000)
      .default(1_000),
    AI_GENERATION_ENABLED: booleanString,
    OPENAI_API_KEY: z.preprocess(
      emptyStringToUndefined,
      z.string().min(20).max(1_000).optional(),
    ),
    AI_PRIMARY_MODEL: aiModel.default('gpt-5.6-terra'),
    AI_ESCALATION_MODEL: aiModel.default('gpt-5.6-sol'),
    AI_REASONING_EFFORT: aiReasoningEffort,
    AI_GENERATION_WORKER_ENABLED: enabledString,
    AI_GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
    AI_GENERATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(30_000)
      .max(900_000)
      .default(300_000),
    AI_MONTHLY_BUDGET_MICROS: z.coerce
      .number()
      .int()
      .min(100_000)
      .max(10_000_000_000)
      .default(15_000_000),
    AI_RUN_BUDGET_MICROS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(100_000_000)
      .default(750_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(500)
      .max(32_000)
      .default(12_000),
    ANALYTICS_ENABLED: booleanString,
    GOOGLE_OAUTH_CLIENT_ID: z.preprocess(
      emptyStringToUndefined,
      z.string().min(10).max(500).optional(),
    ),
    GOOGLE_OAUTH_CLIENT_SECRET: z.preprocess(
      emptyStringToUndefined,
      z.string().min(10).max(1_000).optional(),
    ),
    GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(
      emptyStringToUndefined,
      z.string().url().optional(),
    ),
    ANALYTICS_TOKEN_ENCRYPTION_KEY: z.preprocess(
      emptyStringToUndefined,
      z
        .string()
        .refine((value) => Buffer.from(value, 'base64').length === 32, {
          message: 'debe ser una clave base64 de 32 bytes',
        })
        .optional(),
    ),
  })
  .superRefine((environment, context) => {
    const databaseProtocol = new URL(environment.DATABASE_URL).protocol;
    if (!['postgres:', 'postgresql:'].includes(databaseProtocol)) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'debe utilizar postgres:// o postgresql://',
      });
    }
    if (
      !['redis:', 'rediss:'].includes(new URL(environment.REDIS_URL).protocol)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'debe utilizar redis:// o rediss://',
      });
    }
    if (
      environment.JWT_ACCESS_SECRET === environment.LOGIN_ALIAS_PEPPER ||
      /replace-with/i.test(environment.JWT_ACCESS_SECRET) ||
      /replace-with/i.test(environment.LOGIN_ALIAS_PEPPER)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'los secretos deben ser reales, distintos y no marcadores',
      });
    }
    if (environment.AI_GENERATION_ENABLED && !environment.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'es obligatoria cuando AI_GENERATION_ENABLED=true',
      });
    }
    if (
      environment.AI_RUN_BUDGET_MICROS > environment.AI_MONTHLY_BUDGET_MICROS
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AI_RUN_BUDGET_MICROS'],
        message: 'no puede superar el presupuesto mensual',
      });
    }
    if (environment.ANALYTICS_ENABLED) {
      (
        [
          'GOOGLE_OAUTH_CLIENT_ID',
          'GOOGLE_OAUTH_CLIENT_SECRET',
          'GOOGLE_OAUTH_REDIRECT_URI',
          'ANALYTICS_TOKEN_ENCRYPTION_KEY',
        ] as const
      ).forEach((field) => {
        if (!environment[field]) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'es obligatorio cuando ANALYTICS_ENABLED=true',
          });
        }
      });
    }
    if (environment.NODE_ENV === 'production') {
      if (isUnsafeProductionPassword(environment.DATABASE_URL)) {
        context.addIssue({
          code: 'custom',
          path: ['DATABASE_URL'],
          message:
            'debe incluir una contraseña real de al menos 16 caracteres en producción',
        });
      }
      if (isUnsafeProductionPassword(environment.REDIS_URL)) {
        context.addIssue({
          code: 'custom',
          path: ['REDIS_URL'],
          message:
            'debe incluir una contraseña real de al menos 16 caracteres en producción',
        });
      }
      if (!isAbsolute(environment.EXPORT_STORAGE_DIR)) {
        context.addIssue({
          code: 'custom',
          path: ['EXPORT_STORAGE_DIR'],
          message: 'debe ser una ruta absoluta en producción',
        });
      }
      if (!environment.COOKIE_SECURE) {
        context.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'debe ser true en producción',
        });
      }
      if (environment.SWAGGER_ENABLED === true) {
        context.addIssue({
          code: 'custom',
          path: ['SWAGGER_ENABLED'],
          message: 'no puede habilitarse en producción',
        });
      }
      environment.CORS_ORIGINS.forEach((origin, index) => {
        if (!origin.startsWith('https://')) {
          context.addIssue({
            code: 'custom',
            path: ['CORS_ORIGINS', index],
            message: 'debe utilizar HTTPS en producción',
          });
        }
      });
      if (!environment.PUBLIC_WEB_URL.startsWith('https://')) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_WEB_URL'],
          message: 'debe utilizar HTTPS en producción',
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración inválida de I HERE API: ${details}`);
  }
  return result.data;
}
