import type { TitleCandidate } from "./types";

export type TitlePackageGroup = {
  id: string;
  topic: string;
  createdAt: string | null;
  requestedBy: string;
  generated: boolean;
  candidates: TitleCandidate[];
};

export type EditorialFolderGroup = {
  key: string;
  clientId: string;
  client: string;
  year: number;
  month: number;
  topic: string;
  packages: TitlePackageGroup[];
  candidates: TitleCandidate[];
};

export function groupTitleCandidates(
  candidates: TitleCandidate[],
): TitlePackageGroup[] {
  const groups = new Map<string, TitlePackageGroup>();
  for (const candidate of candidates) {
    const id = candidate.package?.id ?? `manual:${candidate.id}`;
    const existing = groups.get(id);
    if (existing) {
      existing.candidates.push(candidate);
      continue;
    }
    groups.set(id, {
      id,
      topic: candidate.package?.topic ?? "Propuesta creada manualmente",
      createdAt: candidate.package?.createdAt ?? candidate.createdAtIso ?? null,
      requestedBy: candidate.package?.requestedBy ?? candidate.owner,
      generated: Boolean(candidate.package),
      candidates: [candidate],
    });
  }
  return [...groups.values()].toSorted(
    (a, b) => timestamp(b.createdAt) - timestamp(a.createdAt),
  );
}

export function groupTitleFolders(
  candidates: TitleCandidate[],
): EditorialFolderGroup[] {
  const folders = new Map<string, EditorialFolderGroup>();
  for (const group of groupTitleCandidates(candidates)) {
    const first = group.candidates[0];
    const key =
      first.package?.folderKey ?? `manual:${first.client}:${group.id}`;
    const current = folders.get(key);
    if (current) {
      current.packages.push(group);
      current.candidates.push(...group.candidates);
      continue;
    }
    const created = new Date(group.createdAt ?? Date.now());
    folders.set(key, {
      key,
      clientId: first.clientId ?? "",
      client: first.client,
      year: first.package?.year ?? created.getUTCFullYear(),
      month: first.package?.month ?? created.getUTCMonth() + 1,
      topic: first.package?.topic ?? group.topic,
      packages: [group],
      candidates: [...group.candidates],
    });
  }
  return [...folders.values()].toSorted((a, b) => {
    const campaign = b.year * 100 + b.month - (a.year * 100 + a.month);
    if (campaign) return campaign;
    return a.topic.localeCompare(b.topic, "es");
  });
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
