# Portal de resultados: GA4 y Search Console

## Objetivo

El portal consolida resultados de Google Analytics 4 y Google Search Console por cliente. Muestra periodos comparables, evolución diaria, páginas y consultas principales, resultados por nota publicada y permite crear enlaces de lectura para el cliente.

Los datos ayudan a observar tendencias. El sistema no atribuye automáticamente una subida o caída a SEO, GEO, inteligencia artificial o una nota específica; esa conclusión necesita análisis humano y contexto editorial, técnico y estacional.

## Seguridad

- La conexión usa OAuth 2.0 de Google con acceso de solo lectura.
- El refresh token se cifra con AES-256-GCM antes de almacenarse.
- El estado OAuth es aleatorio, expira y solo puede consumirse una vez.
- Cada operación exige permisos sobre el mismo cliente (`analytics.read` o `analytics.manage`).
- Los enlaces públicos usan un token aleatorio; la base conserva únicamente su hash.
- El token público viaja inicialmente en el fragmento de la URL, se guarda en `sessionStorage`, se elimina de la barra del navegador y después se envía en un encabezado.
- Un enlace puede vencer, alcanzar su límite de vistas o revocarse inmediatamente.
- La vista pública no expone credenciales, correo del destinatario ni identificadores internos sensibles.

## Variables locales

Configurar en `apps/api/.env`:

```dotenv
ANALYTICS_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=valor-entregado-por-google
GOOGLE_OAUTH_CLIENT_SECRET=valor-entregado-por-google
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4100/api/v1/analytics/oauth/google/callback
ANALYTICS_TOKEN_ENCRYPTION_KEY=clave-base64-de-32-bytes
```

Generar la clave de cifrado sin reutilizar JWT, contraseñas ni otros secretos:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

En producción, `GOOGLE_OAUTH_REDIRECT_URI` debe apuntar al dominio público de la API y coincidir exactamente con la URI registrada en Google Cloud.

## Configuración en Google Cloud

1. Crear o elegir un proyecto de Google Cloud.
2. Habilitar Google Analytics Data API y Google Search Console API.
3. Configurar la pantalla de consentimiento OAuth para usuarios internos o autorizados.
4. Crear credenciales OAuth de tipo aplicación web.
5. Registrar la URI de redirección local y la de producción.
6. Autorizar desde I HERE la cuenta que tenga acceso a la propiedad GA4 y al sitio de Search Console.
7. En I HERE, guardar el identificador numérico de la propiedad GA4 y el sitio exacto de Search Console, por ejemplo `sc-domain:example.com` o la URL-prefix verificada.

No se debe entregar la contraseña de la cuenta Google al sistema ni a un integrante técnico. La autorización ocurre en Google y puede revocarse desde la cuenta del cliente.

## Sincronización y cálculo

- La sincronización inicial y manual descarga el periodo solicitado desde ambos servicios.
- Cuando Analytics está habilitado, el programador revisa conexiones pendientes y agenda la siguiente actualización.
- Se conserva cada ejecución con estado, rango, filas procesadas y error saneado.
- Las métricas se guardan por día y cliente para comparar el periodo actual contra el periodo anterior de igual duración.
- GA4 aporta sesiones, usuarios activos, vistas, sesiones con interacción y eventos clave.
- Search Console aporta clics, impresiones, CTR y posición media, además de páginas y consultas principales.
- La posición media se interpreta de forma inversa: un valor menor suele representar una mejor posición.

## Vinculación de cada nota publicada

I HERE vincula la versión exportada con su URL canónica real. Puede sugerir la coincidencia a partir del slug, pero un usuario autorizado debe confirmar la URL y la fecha de publicación cuando no sean inequívocas. El sistema no modifica GA4, Search Console ni el sitio del cliente: solo consulta métricas de lectura.

Por cada publicación confirmada se muestran, cuando la fuente dispone de datos:

- vistas, sesiones, usuarios activos, sesiones con interacción, tiempo medio de interacción y eventos clave de GA4;
- clics, impresiones, CTR, posición media y consultas de Search Console;
- evolución frente al periodo anterior comparable;
- cortes acumulados a los 30, 60 y 90 días desde la publicación;
- aprendizaje por artículo y por mes, separado de los resultados históricos que no fueron producidos en I HERE.

La ausencia de una métrica se presenta como falta de datos, no como cero inferido. Una URL sin confirmar no se atribuye a una nota y una variación no se presenta automáticamente como efecto de SEO, GEO, AEO o de la automatización.

## Operación

Antes de compartir un enlace:

1. Confirmar que el cliente correcto está seleccionado.
2. Revisar la fecha de última sincronización y cualquier advertencia.
3. Validar el periodo y las variaciones más relevantes.
4. Añadir contexto humano cuando exista una campaña, migración, estacionalidad o cambio técnico.
5. Confirmar que cada nota nueva tenga su URL canónica y fecha de publicación correctas.
6. Revisar el desempeño individual y los hitos de 30, 60 y 90 días.
7. Crear el enlace para un destinatario identificado y copiarlo una sola vez.
8. Revocarlo cuando ya no deba estar disponible.

Las credenciales y tokens nunca deben copiarse en documentación, capturas, tickets, commits o mensajes de chat.
