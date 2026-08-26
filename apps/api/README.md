# I HERE API

API modular de I HERE construida con NestJS, Fastify, Prisma y PostgreSQL.

## Preparación

Desde la raíz del monorepo:

```bash
pnpm install
pnpm dev:infra
```

Crear `apps/api/.env` desde `.env.example` y reemplazar todos los secretos de ejemplo. Luego:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

La API queda en `http://localhost:4100/api/v1` y Swagger en `http://localhost:4100/api/v1/docs`.

## Calidad

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```

Las pruebas E2E requieren el PostgreSQL local activo. El seed no crea cuentas automáticamente: las variables `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` deben proporcionarse juntas y solo para el entorno correspondiente.

Consulta la explicación completa en `docs/architecture/backend-foundation.md`.
