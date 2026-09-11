export type ActionPlanRecommendation = {
  id: string;
  code: string;
  priority: string;
  status: string;
  observationCount: number;
  implementationNote: string | null;
  targetUrl: string | null;
};

export type AnalyticsActionPlanItem = {
  id: 'measurement' | 'editorial' | 'technical';
  front: string;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  status: 'PENDING' | 'IN_PROGRESS' | 'VALIDATED' | 'DISMISSED';
  moodOwner: string;
  moodAction: string;
  clientOwner: string;
  clientAction: string;
  dependency: string;
  dueDate: string;
  evidence: string;
  validation: string;
  recommendationCount: number;
  repeatedCount: number;
};

type PlanDefinition = Omit<
  AnalyticsActionPlanItem,
  | 'priority'
  | 'status'
  | 'dueDate'
  | 'evidence'
  | 'recommendationCount'
  | 'repeatedCount'
> & {
  codes: ReadonlySet<string>;
  dueBusinessDays?: number;
  dueCalendarDays?: number;
  evidenceSource: string;
};

const planDefinitions: PlanDefinition[] = [
  {
    id: 'measurement',
    front: 'Medición del CTA y formularios',
    codes: new Set(['NO_KEY_EVENTS']),
    moodOwner: 'Mood · Analítica',
    moodAction:
      'Definir los eventos, parámetros y páginas que deben medirse; comprobar después su registro por nota en GA4.',
    clientOwner: 'Tecnología/Web del cliente',
    clientAction:
      'Implementar la medición en el sitio y confirmar que el CTA y el formulario emitan los eventos acordados.',
    dependency:
      'Configuración técnica habilitada en el sitio y acceso operativo a GA4.',
    validation:
      'Comprobar en GA4 el evento, la URL de origen y el envío satisfactorio del formulario.',
    dueBusinessDays: 5,
    evidenceSource: 'GA4',
  },
  {
    id: 'editorial',
    front: 'Estándar editorial y optimización de contenidos',
    codes: new Set(['LOW_CTR', 'LOW_ENGAGEMENT', 'NEAR_PAGE_ONE']),
    moodOwner: 'Mood · SEO y Contenidos',
    moodAction:
      'Priorizar las notas señaladas y ajustar título, descripción, respuesta inicial, estructura, entidades y enlaces internos según cada hallazgo.',
    clientOwner: 'Marketing/Contenido del cliente',
    clientAction:
      'Revisar, aprobar y programar la publicación de los ajustes propuestos.',
    dependency:
      'Disponibilidad de la URL publicada, ventana de edición y aprobación del contenido.',
    validation:
      'Comparar CTR, posición e interacción en GA4 y GSC durante el siguiente periodo equivalente.',
    dueBusinessDays: 10,
    evidenceSource: 'GA4 y GSC',
  },
  {
    id: 'technical',
    front: 'URLs, canónicos, redirecciones y plantilla',
    codes: new Set(['PUBLICATION_URL']),
    moodOwner: 'Mood · SEO Técnico',
    moodAction:
      'Auditar las URLs afectadas, documentar la corrección exacta y entregar una lista cerrada de incidencias.',
    clientOwner: 'Tecnología/Web del cliente',
    clientAction:
      'Aplicar los cambios en el CMS o servidor y revisar la plantilla cuando el mismo problema se repita.',
    dependency:
      'Confirmación de la URL definitiva y disponibilidad del equipo que administra el sitio.',
    validation:
      'Revisar estado HTTP, destino final, canonical e indexación mediante comprobación técnica y GSC.',
    dueCalendarDays: 15,
    evidenceSource: 'validación técnica y GSC',
  },
];

export function buildAnalyticsActionPlan(
  recommendations: ActionPlanRecommendation[],
  reportEnd: string,
): AnalyticsActionPlanItem[] {
  return planDefinitions.flatMap((definition) => {
    const related = recommendations.filter((item) =>
      definition.codes.has(item.code),
    );
    if (!related.length) return [];
    const repeatedCount = related.filter(
      (item) => item.status === 'OPEN' && item.observationCount >= 2,
    ).length;
    return [
      {
        id: definition.id,
        front: definition.front,
        priority: highestPriority(related),
        status: planStatus(related),
        moodOwner: definition.moodOwner,
        moodAction: definition.moodAction,
        clientOwner: definition.clientOwner,
        clientAction: definition.clientAction,
        dependency: definition.dependency,
        dueDate: dueDate(reportEnd, definition),
        evidence: `${related.length} señal${related.length === 1 ? '' : 'es'} sustentada${related.length === 1 ? '' : 's'} en ${definition.evidenceSource}${repeatedCount ? `; ${repeatedCount} pendiente${repeatedCount === 1 ? '' : 's'} por segundo periodo` : ''}.`,
        validation: definition.validation,
        recommendationCount: related.length,
        repeatedCount,
      },
    ];
  });
}

function highestPriority(items: ActionPlanRecommendation[]) {
  const rank = { ALTA: 3, MEDIA: 2, BAJA: 1 } as const;
  return items.reduce<AnalyticsActionPlanItem['priority']>((highest, item) => {
    const priority = normalizePriority(item.priority);
    return rank[priority] > rank[highest] ? priority : highest;
  }, 'BAJA');
}

function normalizePriority(value: string): AnalyticsActionPlanItem['priority'] {
  return value === 'ALTA' || value === 'MEDIA' || value === 'BAJA'
    ? value
    : 'BAJA';
}

function planStatus(
  items: ActionPlanRecommendation[],
): AnalyticsActionPlanItem['status'] {
  const open = items.some((item) => item.status === 'OPEN');
  const implemented = items.some((item) => item.status === 'IMPLEMENTED');
  if (open && implemented) return 'IN_PROGRESS';
  if (open) return 'PENDING';
  if (implemented) return 'VALIDATED';
  return 'DISMISSED';
}

function dueDate(reportEnd: string, definition: PlanDefinition) {
  const result = new Date(`${reportEnd}T12:00:00.000Z`);
  if (definition.dueCalendarDays) {
    result.setUTCDate(result.getUTCDate() + definition.dueCalendarDays);
  } else {
    let remaining = definition.dueBusinessDays ?? 0;
    while (remaining > 0) {
      result.setUTCDate(result.getUTCDate() + 1);
      const day = result.getUTCDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
  }
  return result.toISOString().slice(0, 10);
}
