# I HERE

Plataforma interna para organizar automatizaciones editoriales, aprobaciones humanas, administración y analítica para clientes.

## Estado actual

La primera automatización de I HERE está integrada de extremo a extremo:

- propuestas de títulos, evaluación multiagente, detección de duplicidad y aprobación humana;
- generación y edición versionada de notas, QA, propuesta visual y revisión del cliente mediante paquetes navegables;
- exportación HTML, DOCX y PDF con trazabilidad;
- aprendizaje editorial estructurado a partir de correcciones aprobadas;
- administración de usuarios, roles, permisos por organización y cliente, sesiones y auditoría;
- portal de resultados con GA4 y Google Search Console, desempeño por publicación, hitos de 30/60/90 días y enlaces públicos revocables;
- generación asistida por OpenAI con presupuestos, registro de ejecuciones y evidencia privada;
- autenticación con correo corporativo, contraseña, sesiones rotativas y controles de aislamiento entre clientes.

La aplicación web usa Next.js y la API usa NestJS/Fastify, PostgreSQL, Prisma, Redis y BullMQ. Los cambios críticos conservan revisión humana y quedan registrados en auditoría.

## Ejecutar en local

Requisitos: Node.js 24, pnpm 11 y Docker Desktop.

```bash
pnpm install
pnpm dev:infra
pnpm dev
```

Abrir `http://localhost:3001`. La raíz redirige a `/login`; después de autenticar, el producto está disponible desde `/inicio`. El comando `pnpm dev` levanta la web y la API juntas; no ejecutes una segunda instancia en paralelo.

Para la API, copiar `apps/api/.env.example` a `apps/api/.env`, reemplazar todos los secretos de ejemplo y ejecutar:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

La API usa `http://localhost:4100/api/v1` y documenta su contrato en `/api/v1/docs`. El seed solo crea un usuario administrador si se definen juntas las variables `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`.

Las integraciones de OpenAI y Google están desactivadas por defecto. Sus credenciales se configuran únicamente en `apps/api/.env`; nunca deben escribirse en el repositorio. La conexión de GA4/Search Console se completa por OAuth desde el portal de resultados. Consulta [docs/architecture/analytics-results-portal.md](docs/architecture/analytics-results-portal.md).

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter api test:e2e
```

## Estructura

- `apps/web`: aplicación Next.js.
- `apps/api`: API NestJS/Fastify y esquema Prisma.
- `docs/product`: alcance y decisiones de producto.
- `docs/architecture`: arquitectura técnica y controles operativos.
- `infra`: PostgreSQL y Redis para desarrollo, además de Docker/Caddy para producción.

## Producción

La plantilla `infra/production.env.example` no contiene secretos utilizables. La configuración productiva exige credenciales reales, separa la red de aplicación de la red de datos y ejecuta API/web sin privilegios de root. Por defecto la web se publica solo en `127.0.0.1:3100` para integrarse de forma segura con el Nginx del servidor. El proxy Caddy incluido queda disponible únicamente con el perfil opcional `caddy`, evitando competir por los puertos 80 y 443 en servidores compartidos. El workflow `.github/workflows/ci.yml` valida lint, tipos, pruebas, build, migraciones y contenedores antes de una entrega.

El despliegue no se realiza automáticamente desde este repositorio: requiere completar secretos, dominio, respaldo, OAuth de Google y una revisión final del entorno VPS.
