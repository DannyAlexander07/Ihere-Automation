import type { PublicationPerformance } from "./types";

export type ArticleInsight = {
  tone: "learning" | "opportunity" | "positive";
  title: string;
  detail: string;
};

export function publicationMonthKey(value: string): string {
  return value.slice(0, 7);
}

export function latestMilestone(publication: PublicationPerformance) {
  return publication.milestones.toSorted((a, b) => b.days - a.days)[0] ?? null;
}

export function buildArticleInsight(publication: PublicationPerformance): ArticleInsight {
  const milestone = latestMilestone(publication);
  if (!milestone || (milestone.ga4.sessions === 0 && milestone.gsc.impressions === 0)) {
    return {
      tone: "learning",
      title: "Aún en ventana de aprendizaje",
      detail: "Todavía no hay volumen suficiente para recomendar un cambio. Confirma indexación y vuelve a revisar el siguiente corte.",
    };
  }
  if (milestone.gsc.impressions >= 100 && milestone.gsc.ctr < 0.02) {
    return {
      tone: "opportunity",
      title: "Oportunidad de mejorar el CTR",
      detail: "La página ya aparece en búsquedas, pero recibe pocos clics. Conviene revisar el título SEO y la metadescripción sin cambiar el contenido aprobado.",
    };
  }
  const engagementRate = milestone.ga4.sessions
    ? milestone.ga4.engagedSessions / milestone.ga4.sessions
    : null;
  if (engagementRate !== null && milestone.ga4.sessions >= 10 && engagementRate < 0.5) {
    return {
      tone: "opportunity",
      title: "La respuesta inicial puede ser más clara",
      detail: "La nota atrae visitas, pero la interacción es baja. Revisa la apertura, la respuesta directa y la jerarquía de subtítulos.",
    };
  }
  if (milestone.ga4.sessions >= 10 && milestone.ga4.keyEvents === 0) {
    return {
      tone: "opportunity",
      title: "Revisar la orientación a la acción",
      detail: "Hay lectura, pero no se registran eventos clave. Comprueba el CTA, su enlace y la medición del evento antes de atribuirlo al contenido.",
    };
  }
  return {
    tone: "positive",
    title: "Señales editoriales saludables",
    detail: "La nota acumula visibilidad e interacción sin una alerta prioritaria. Mantén el seguimiento y compárala con artículos del mismo servicio.",
  };
}
