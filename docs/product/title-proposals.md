# I HERE - Propuestas de títulos

## Objetivo

Implementar el primer submódulo del flujo editorial: propuesta, evaluación, revisión humana, aprobación o rechazo y aprendizaje controlado.

## Reglas implementadas

- Cada título conserva objetivo, público, intención, enfoque, oportunidad y riesgo.
- La estructura de duplicidad admite porcentaje, nota relacionada y recomendación; los valores solo se muestran cuando provienen del backend.
- Una duplicidad alta sin resolver bloquea la aprobación.
- Un bloqueo especializado también impide aprobar.
- La evaluación muestra conclusiones y hallazgos, no razonamiento privado de modelos.
- Aprobar, rechazar, pedir cambios, editar y resolver duplicidad dejan un evento persistido y auditable.
- Una preferencia permanente necesita confirmación explícita y queda como regla candidata.
- Una propuesta aprobada, rechazada o utilizada se considera inmutable.

## Alcance técnico actual

La experiencia autentica al usuario y consume el API autorizado. Clientes, propuestas, versiones, evaluaciones, decisiones e historial se persisten en PostgreSQL. Las nuevas alternativas se crean de forma estructurada y pasan automáticamente por una evaluación auditable.

BullMQ ejecuta un primer motor de reglas editoriales y duplicidad textual. El worker registra cuatro perspectivas estructuradas —duplicidad, SEO, QA y juez—, además de puntaje, hallazgos, motor y duración. Estas perspectivas no se presentan como modelos de IA: provienen de reglas deterministas versionadas. La interfaz consulta el resultado automáticamente mientras una evaluación está en cola o en ejecución.

La duplicidad semántica y un eventual proveedor generativo siguen pendientes. Cuando se incorporen, deberán conservar fuentes, versión del modelo, costo, tiempo, límites y revisión humana sin exponer razonamiento privado.

## Criterios verificados

- Bandeja, búsqueda y filtros.
- Resumen de pendientes, aprobados y bloqueos.
- Panel de detalle responsive.
- Reglas editoriales visibles.
- Resolución humana de duplicidad.
- Evaluación por especialidad y juez.
- Historial de decisiones.
- Creación persistida de alternativas con estado de progreso real.
- Entrega transaccional mediante outbox, Redis y BullMQ.
- Recuperación de evaluaciones pendientes después de un reinicio.
- Reintentos con espera exponencial e idempotencia por trabajo.
- Duplicidad textual contra el historial real del cliente.
- Evaluación determinista de 100 puntos y cuatro resultados auditables.
- Actualización automática de la bandeja mientras trabaja el motor.
- Aprobación permitida solo cuando no existen bloqueos.
- Vista móvil, tablet, laptop y TV.
