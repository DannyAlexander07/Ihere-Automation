# Auditoría pública del blog de Adecco Perú e integración con I HERE

**Fecha de revisión:** 28 de agosto de 2026  
**Alcance:** páginas públicas de `https://www.adecco.com/es-pe/blog`, archivos públicos de rastreo y datos de solo lectura ya autorizados en GA4 y Google Search Console.  
**Fuera de alcance:** CMS, repositorio, Tag Manager, configuración de GA4/GSC y cualquier cambio sobre la plataforma de Adecco.

## Resumen ejecutivo

La integración recomendada tiene dos líneas complementarias:

1. **I HERE se acopla sin intervenir la web.** Cada sincronización consulta GA4 y Search Console, reconoce URLs de artículos aunque hayan sido cargadas por Tecnología de Adecco y las incorpora al rendimiento por artículo. Una coincidencia con una nota propia es opcional.
2. **Tecnología de Adecco corrige la plantilla pública.** La auditoría encontró señales que pueden dividir la consolidación de URLs, confundir metadatos sociales o dificultar el rastreo. I HERE normaliza las rutas para medirlas, pero no puede corregir el HTML que entrega el sitio.

La conexión analítica permanece en modo lectura. Ninguna acción de I HERE publica, elimina o modifica contenido en Adecco.

## Hallazgos verificados

### P0 — Una misma página entrega dos canonical y uno apunta a Contacto

En la muestra `inteligencia-artificial-en-recursos-humanos` aparecen dos elementos `link rel="canonical"`: uno apunta al artículo y otro a `/es-pe/servicios/servicios-contactanos`. También el `og:url` apunta a Contacto.

**Riesgo:** señales contradictorias para consolidación de URL, compartidos sociales y atribución del artículo.

**Corrección recomendada:** generar un solo canonical absoluto y autorreferente por artículo; alinear `og:url` con ese canonical. El CTA puede enlazar a Contacto, pero no debe inyectar metadatos de la página de Contacto dentro del documento del artículo.

**Prueba de aceptación:** el HTML final contiene exactamente un canonical y un `og:url`, ambos iguales a la URL pública normalizada del artículo.

### P0 — Redirección repetitiva en URLs con caracteres acentuados

Varias URLs actuales usan segmentos percent-encoded. La respuesta observada redirige, por ejemplo, `%C3%B3` a `%c3%b3`; solicitar la variante en minúsculas vuelve a recibir la misma redirección.

**Riesgo:** bucle de redirecciones para clientes HTTP, rastreadores o herramientas que respeten literalmente la ubicación recibida; pérdida o retraso de señales.

**Corrección recomendada:** escoger una sola política de slug, preferiblemente ASCII (`seleccion-especializada`), y emitir como máximo una redirección 301 hacia la URL canónica final, que debe responder 200.

**Prueba de aceptación:** `curl -IL <url>` termina en 200 con cero o una redirección y no repite la misma ruta por diferencias de mayúsculas en escapes.

### P1 — Estructura documental y metadatos duplicados

La muestra pública contiene dos etiquetas `html`, dos `title`, dos metadescripciones y dos `h1`. El segundo bloque presenta variaciones de texto.

**Riesgo:** interpretación ambigua, mantenimiento difícil y diferencias entre lo que ve el usuario, buscadores y plataformas sociales.

**Corrección recomendada:** revisar la composición de la plantilla o componente embebido. El documento final debe contener un solo `html`, `head`, `title`, metadescripción principal y `h1` editorial.

### P1 — Fechas públicas incompatibles

Se observaron artículos con dos fechas distintas en una misma página o extracto. Ejemplos públicos:

- “Compensación total” muestra 17 de agosto de 2026 y también 10 de agosto de 2026.
- “Diagnóstico de clima laboral” muestra 8 de junio y también 23 de junio de 2026.
- “Selección especializada” figura con 31 de agosto de 2026 aunque la revisión se realizó el 28 de agosto y el artículo ya era visible en el listado público.

**Riesgo:** orden editorial incorrecto, informes por mes inconsistentes y señales confusas de frescura.

**Corrección recomendada:** mantener una fuente de verdad para `datePublished` y otra para `dateModified`; no publicar una fecha futura salvo que la página permanezca inaccesible/no indexable hasta ese momento.

### P1 — Falta esquema `BlogPosting` completo en la muestra

La muestra incluye `BreadcrumbList`, pero no se observó un bloque `BlogPosting` o `Article` que identifique título, URL canónica, autor, editor, imagen y fechas.

**Riesgo:** menor claridad semántica para buscadores y sistemas generativos.

**Corrección recomendada:** añadir JSON-LD `BlogPosting` por artículo con `headline`, `description`, `mainEntityOfPage`, `datePublished`, `dateModified`, `author`, `publisher`, `image` y `inLanguage`. Validar que cada valor coincida con el contenido visible.

### P1 — Sitemap con rutas editoriales probablemente incompletas

El sitemap público contiene 125 URLs bajo `/es-pe/blog/`. Entre ellas aparecen simultáneamente:

- `/capacitacion-y-desarrollo-de-habilidades-clave-como-preparar-a-tus`
- `/capacitacion-y-desarrollo-de-habilidades-clave-como-preparar-a-tus-equipos`

**Riesgo:** canibalización o inclusión de una versión truncada si ambas resuelven a contenido indexable.

**Corrección recomendada:** conservar solo la versión canónica 200 en el sitemap; redirigir o retirar la variante incompleta. Incorporar `lastmod` confiable cuando la plataforma lo permita.

### P2 — Datos visibles de lectura y fecha poco consistentes

El texto “Tiempo de lectura 15 minutos” aparece de forma repetida incluso cuando otro bloque de la misma página muestra “3 minutos”. También se encontraron cadenas de fecha sin espacios.

**Riesgo:** baja confianza editorial y experiencia poco cuidada.

**Corrección recomendada:** calcular el tiempo a partir del contenido final y renderizar la fecha con una única función localizada para `es-PE`.

## Qué hará I HERE

- Mantendrá la integración con GA4 y Search Console en modo lectura.
- Detectará cualquier URL de artículo presente en las filas sincronizadas, aunque no exista una nota de I HERE.
- Normalizará caracteres codificados, parámetros de campaña y barras finales para evitar duplicados internos.
- Excluirá el índice del blog y rutas de etiquetas, autores, búsquedas o paginación.
- Mostrará la publicación externa en “Rendimiento por artículo”.
- La registrará como publicación externa pendiente de confirmar; al confirmar fecha y URL activará los cortes de 30, 60 y 90 días.
- Si más adelante la URL coincide con una nota exportada por I HERE, vinculará ambos registros sin crear un duplicado.
- No escribirá en GA4, GSC, el CMS ni el código de Adecco.

## Qué necesita resolver Tecnología de Adecco

1. Canonical y `og:url` únicos y correctos.
2. Redirecciones deterministas para slugs con acentos.
3. Una sola estructura HTML, `title`, descripción y `h1`.
4. Fecha de publicación/modificación coherente y no futura.
5. JSON-LD `BlogPosting` validado.
6. Sitemap sin variantes truncadas ni URLs que redirigen en bucle.
7. CTA a Contacto como enlace, sin inyectar metadatos de Contacto en el artículo.

## Acuerdo operativo recomendado

- Tecnología de Adecco continúa publicando como hasta ahora.
- I HERE sincroniza cada seis horas; GA4 y Search Console pueden reflejar una URL con demora propia de Google.
- El equipo de la agencia confirma una sola vez la fecha detectada para activar hitos editoriales exactos.
- Si Adecco desea detección inmediata, la mejora ideal es un feed o webhook de publicaciones con URL canónica, título y `datePublished`; no es requisito para la primera versión.
- Los problemas técnicos del sitio se reportan por separado y nunca bloquean la preparación editorial, pero sí deben quedar visibles porque pueden afectar el resultado medido.

## Evidencia pública revisada

- `https://www.adecco.com/es-pe/blog`
- `https://www.adecco.com/robots.txt`
- `https://www.adecco.com/sitemap.xml`
- `https://www.adecco.com/es-pe-static-sitemap.xml`
- `https://www.adecco.com/es-pe/blog/inteligencia-artificial-en-recursos-humanos`
- `https://www.adecco.com/es-pe/blog/compensacion-total-por-que-el-salario-ya-no-es-el-unico-factor-para-atraer`
- `https://www.adecco.com/es-pe/blog/seleccion-especializada-como-encontrar-perfiles-de-dificil-cobertura-en-un-mercado-cada`

> Nota: algunas URLs se muestran aquí sin caracteres acentuados para facilitar su lectura. La evidencia técnica se tomó sobre las variantes públicas realmente servidas.

## Referencias técnicas

- Google Search Central, [canonicalización de URLs](https://developers.google.com/search/docs/crawling-indexing/canonicalization).
- Google Search Central, [datos estructurados para artículos](https://developers.google.com/search/docs/appearance/structured-data/article).
- Google Search Central, [fechas visibles de publicación y modificación](https://developers.google.com/search/docs/appearance/publication-dates).
- Google Search Central, [creación y envío de sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Estas referencias describen señales y prácticas admitidas por Google; no garantizan por sí solas posiciones, indexación ni resultados enriquecidos.
