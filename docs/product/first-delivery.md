# I HERE - primera entrega funcional

## Estado

Implementada y verificada localmente el 15 de agosto de 2026.

Incluye `/login`, `/inicio`, navegación por submódulos, temas Professional y Aurora, búsqueda con `Ctrl+K`, estados de carga/error/vacío/éxito y adaptación a móvil, tablet, laptop y TV. El acceso visual original fue sustituido posteriormente por autenticación y autorización reales.

## Objetivo

Construir la fundación visual y navegable que heredarán Automatización de notas y el Portal de resultados. La versión vigente ya conecta autenticación, clientes y títulos con el backend.

## Alcance

- Login responsive con correo corporativo y contraseña.
- Sesión real con access token en memoria, refresh seguro y cierre de sesión revocable.
- App Shell con sidebar desplegable, navegación anidada, header, breadcrumbs y perfil.
- Temas claros I HERE Professional e I HERE Aurora.
- Dashboard inicial con pendientes, actividad, estado de automatizaciones y accesos rápidos.
- Estados de carga, vacío, error y éxito con movimiento reducido.
- Comportamiento específico para móvil, tablet, laptop/desktop y pantallas TV.

## Reglas no negociables

- No usar documentos personales como contraseña ni identificador técnico.
- La autorización se valida en el backend; la protección visual de rutas no sustituye ese control.
- No incluir secretos, tokens, credenciales ni datos reales de clientes.
- No utilizar zoom artificial para compactar la interfaz.
- Thinking Orbs representa actividad indeterminada y siempre incluye texto y etapa real.
- Todos los controles deben funcionar con teclado y mostrar foco visible.

## Criterios de aceptación

- Las rutas `/login` e `/inicio` cargan sin errores.
- El login es legible desde 320 px y no presenta desplazamiento horizontal.
- El sidebar se transforma en drawer en móvil, modo compacto en tablet y expandido en escritorio.
- En pantallas desde 1920 px, el dashboard aumenta legibilidad y aprovecha el ancho sin estirar líneas de texto.
- Los dos temas mantienen contraste, jerarquía y estados consistentes.
- `prefers-reduced-motion` elimina movimientos no esenciales.
- Lint, TypeScript y build finalizan correctamente.

## Siguiente entrega

El worker auditable de títulos y la duplicidad textual ya están operativos. El siguiente bloque aprobado está definido en `note-workflow.md`: Título aprobado -> Nota versionada -> QA -> Aprobación humana -> Exportación.
