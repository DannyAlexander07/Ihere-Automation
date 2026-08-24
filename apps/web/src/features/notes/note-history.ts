import type { ApiNoteDetail } from "./types";

export type NoteVersion = ApiNoteDetail["versions"][number];

export type VersionDifference = {
  key: string;
  label: string;
  selectedValue: string;
  currentValue: string;
};

export type QaEvidenceItem = {
  key: string;
  label: string;
  value: string;
};

const evidenceLabels: Record<string, string> = {
  firstAnswerLength: "Longitud de respuesta inicial",
  wordCount: "Palabras",
  headingCount: "Encabezados",
  sourceCount: "Fuentes",
  hasPrimarySource: "Fuente prioritaria",
  blockCount: "Bloques",
  hasList: "Incluye lista",
  hasMetaTitle: "Meta title",
  hasMetaDescription: "Meta description",
  internalLinkCount: "Enlaces internos",
  datedSources: "Fuentes con fecha",
  hasCtaText: "CTA definido",
  hasCtaUrl: "CTA enlazado",
  hasPlaceholder: "Marcadores pendientes",
  emptyBlocks: "Bloques vacíos",
};

export function compareNoteVersions(
  selected: NoteVersion,
  current: NoteVersion,
): VersionDifference[] {
  const fields = [
    comparison("title", "Título", selected.title, current.title),
    comparison(
      "metaTitle",
      "Meta title",
      selected.metaTitle,
      current.metaTitle,
    ),
    comparison(
      "metaDescription",
      "Meta description",
      selected.metaDescription,
      current.metaDescription,
    ),
    comparison("slug", "Slug", selected.slug, current.slug),
    comparison("excerpt", "Extracto", selected.excerpt, current.excerpt),
    comparison("authorName", "Autor", selected.authorName, current.authorName),
    comparison("authorRole", "Cargo", selected.authorRole, current.authorRole),
    comparison("ctaText", "CTA", selected.ctaText, current.ctaText),
    comparison("ctaUrl", "URL del CTA", selected.ctaUrl, current.ctaUrl),
    comparison(
      "internalLinks",
      "Enlaces internos",
      stringList(selected.internalLinks),
      stringList(current.internalLinks),
    ),
    comparison(
      "content",
      "Contenido",
      contentFingerprint(selected),
      contentFingerprint(current),
      selected.contentHash !== current.contentHash,
    ),
    comparison(
      "sources",
      "Fuentes",
      `${selected.sources.length} fuente(s)`,
      `${current.sources.length} fuente(s)`,
      sourceFingerprint(selected) !== sourceFingerprint(current),
    ),
  ];

  return fields.filter((field): field is VersionDifference => field !== null);
}

export function parseQaFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => compact(item, 280))
    .filter(Boolean)
    .slice(0, 20);
}

export function parseQaEvidence(value: unknown): QaEvidenceItem[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .slice(0, 20)
    .map(([key, item]) => ({
      key,
      label: evidenceLabels[key] ?? humanizeKey(key),
      value: evidenceValue(item),
    }))
    .filter((item) => item.value.length > 0);
}

function comparison(
  key: string,
  label: string,
  selected: unknown,
  current: unknown,
  changed = normalize(selected) !== normalize(current),
): VersionDifference | null {
  if (!changed) return null;
  return {
    key,
    label,
    selectedValue: display(selected),
    currentValue: display(current),
  };
}

function contentFingerprint(version: NoteVersion) {
  const blockCount = version.content.blocks.length;
  return `${version.wordCount} palabras · ${blockCount} ${blockCount === 1 ? "bloque" : "bloques"}`;
}

function sourceFingerprint(version: NoteVersion) {
  return version.sources
    .map(
      (source) =>
        `${source.type}:${source.title}:${source.entity}:${source.url}:${source.publishedAt ?? ""}:${source.accessedAt}`,
    )
    .sort()
    .join("|");
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is string => typeof item === "string")
    .join(" · ");
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : (value ?? "");
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "")
    return "Sin definir";
  return compact(String(value), 320);
}

function evidenceValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number" && Number.isFinite(value))
    return value.toLocaleString("es-PE");
  if (typeof value === "string") return compact(value, 240);
  if (Array.isArray(value)) {
    return compact(
      value
        .filter(
          (item): item is string | number | boolean =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        )
        .map((item) =>
          typeof item === "boolean" ? (item ? "Sí" : "No") : String(item),
        )
        .join(" · "),
      240,
    );
  }
  return "";
}

function humanizeKey(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!words) return "Dato";
  return `${words.charAt(0).toUpperCase()}${words.slice(1).toLowerCase()}`;
}

function compact(value: string, maximum: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maximum
    ? `${normalized.slice(0, maximum - 1)}…`
    : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
