process.env.NODE_ENV = 'test';
process.env.PORT = '4101';
process.env.API_PREFIX = 'api/v1';
process.env.DEFAULT_TENANT_CODE = 'mood';
process.env.DATABASE_URL ??=
  'postgresql://ihere:ihere_local_only@localhost:54329/ihere_e2e';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET =
  'e2e-only-jwt-secret-with-more-than-32-characters';
process.env.LOGIN_ALIAS_PEPPER =
  'e2e-only-login-pepper-more-than-32-characters';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '14';
process.env.COOKIE_SECURE = 'false';
process.env.TRUST_PROXY = 'false';
process.env.REDIS_URL = 'redis://localhost:63799';
process.env.TITLE_EVALUATION_WORKER_ENABLED = 'false';
process.env.TITLE_EVALUATION_CONCURRENCY = '1';
process.env.TITLE_EVALUATION_TIMEOUT_MS = '30000';
process.env.NOTE_QA_WORKER_ENABLED = 'false';
process.env.NOTE_QA_CONCURRENCY = '1';
process.env.NOTE_QA_TIMEOUT_MS = '30000';
process.env.EXPORT_WORKER_ENABLED = 'false';
process.env.EXPORT_CONCURRENCY = '1';
process.env.EXPORT_TIMEOUT_MS = '120000';
process.env.EXPORT_STORAGE_DIR = 'storage/test-exports';
process.env.OUTBOX_POLL_INTERVAL_MS = '1000';
process.env.AI_GENERATION_ENABLED = 'false';
process.env.AI_GENERATION_WORKER_ENABLED = 'false';
process.env.AI_GENERATION_CONCURRENCY = '1';
process.env.AI_GENERATION_TIMEOUT_MS = '300000';
process.env.AI_MONTHLY_BUDGET_MICROS = '15000000';
process.env.AI_RUN_BUDGET_MICROS = '750000';
process.env.AI_MAX_OUTPUT_TOKENS = '12000';
