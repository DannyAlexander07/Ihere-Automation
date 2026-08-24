import { validateEnvironment } from './environment';

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/ihere',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'jwt-secret-for-tests-with-more-than-32-characters',
  LOGIN_ALIAS_PEPPER: 'login-pepper-for-tests-with-more-than-32-characters',
  REDIS_URL: 'redis://localhost:6379',
};

const productionDatastores = {
  DATABASE_URL:
    'postgresql://user:production-database-password@localhost:5432/ihere',
  REDIS_URL: 'redis://:production-redis-password@localhost:6379',
};

describe('validateEnvironment', () => {
  it('acepta configuración local explícita y segura', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'test',
      COOKIE_SECURE: false,
      CORS_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('normaliza variables opcionales vacías cuando las integraciones están deshabilitadas', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        OPENAI_API_KEY: '',
        ANALYTICS_ENABLED: 'false',
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: '',
        GOOGLE_OAUTH_REDIRECT_URI: '',
        ANALYTICS_TOKEN_ENCRYPTION_KEY: '',
      }),
    ).toMatchObject({
      AI_GENERATION_ENABLED: false,
      ANALYTICS_ENABLED: false,
      OPENAI_API_KEY: undefined,
      GOOGLE_OAUTH_CLIENT_ID: undefined,
    });
  });

  it('exige todos los secretos de analítica cuando se habilita', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ANALYTICS_ENABLED: 'true',
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: '',
        GOOGLE_OAUTH_REDIRECT_URI: '',
        ANALYTICS_TOKEN_ENCRYPTION_KEY: '',
      }),
    ).toThrow('GOOGLE_OAUTH_CLIENT_ID');
  });

  it('rechaza comodines, rutas y protocolos ajenos en CORS', () => {
    for (const origin of ['*', 'https://app.ihere.pe/login', 'file://local']) {
      expect(() =>
        validateEnvironment({ ...validEnvironment, CORS_ORIGINS: origin }),
      ).toThrow('CORS_ORIGINS');
    }
  });

  it('rechaza secretos reutilizados o marcadores', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LOGIN_ALIAS_PEPPER: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow('secretos deben ser reales');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('secretos deben ser reales');
  });

  it('exige HTTPS, cookie segura y Swagger cerrado en producción', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ...productionDatastores,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
        SWAGGER_ENABLED: 'true',
        EXPORT_STORAGE_DIR: '/app/storage/exports',
      }),
    ).toThrow('Configuración inválida');

    expect(
      validateEnvironment({
        ...validEnvironment,
        ...productionDatastores,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        SWAGGER_ENABLED: 'false',
        CORS_ORIGINS: 'https://app.ihere.pe',
        PUBLIC_WEB_URL: 'https://app.ihere.pe',
        EXPORT_STORAGE_DIR: '/app/storage/exports',
      }),
    ).toMatchObject({ COOKIE_SECURE: true, SWAGGER_ENABLED: false });

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ...productionDatastores,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        SWAGGER_ENABLED: 'false',
        CORS_ORIGINS: 'https://app.ihere.pe',
        PUBLIC_WEB_URL: 'https://app.ihere.pe',
        EXPORT_STORAGE_DIR: 'storage/exports',
      }),
    ).toThrow('EXPORT_STORAGE_DIR');
  });

  it('rechaza credenciales de datastore vacías, cortas o marcadores en producción', () => {
    const productionEnvironment = {
      ...validEnvironment,
      ...productionDatastores,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'false',
      CORS_ORIGINS: 'https://app.ihere.pe',
      PUBLIC_WEB_URL: 'https://app.ihere.pe',
      EXPORT_STORAGE_DIR: '/app/storage/exports',
    };

    for (const databaseUrl of [
      'postgresql://user@localhost:5432/ihere',
      'postgresql://user:short@localhost:5432/ihere',
      'postgresql://user:replace-with-a-password@localhost:5432/ihere',
    ]) {
      expect(() =>
        validateEnvironment({
          ...productionEnvironment,
          DATABASE_URL: databaseUrl,
        }),
      ).toThrow('DATABASE_URL');
    }

    for (const redisUrl of [
      'redis://localhost:6379',
      'redis://:short@localhost:6379',
      'redis://:change-me-in-production@localhost:6379',
    ]) {
      expect(() =>
        validateEnvironment({
          ...productionEnvironment,
          REDIS_URL: redisUrl,
        }),
      ).toThrow('REDIS_URL');
    }
  });

  it('exige credencial y un presupuesto coherente al habilitar IA', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AI_GENERATION_ENABLED: 'true',
      }),
    ).toThrow('OPENAI_API_KEY');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AI_GENERATION_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-only-not-a-real-credential',
        AI_MONTHLY_BUDGET_MICROS: '100000',
        AI_RUN_BUDGET_MICROS: '200000',
      }),
    ).toThrow('presupuesto mensual');
  });
});
