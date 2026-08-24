import { z } from 'zod';

export const titleCandidateSchema = z.object({
  title: z.string().min(10).max(220),
  objective: z.string().min(10).max(600),
  audience: z.string().min(3).max(300),
  searchIntent: z.string().min(3).max(300),
  focus: z.string().min(3).max(500),
  opportunity: z.string().min(3).max(600),
  risk: z.string().min(3).max(600),
});

export const titleStrategySchema = z.object({
  summary: z.string().min(20).max(1200),
  candidates: z.array(titleCandidateSchema).min(3).max(8),
});

export const titleEditorialReviewSchema = z.object({
  summary: z.string().min(20).max(1200),
  candidates: z
    .array(
      titleCandidateSchema.extend({
        score: z.number().int().min(0).max(100),
        findings: z.array(z.string().min(2).max(500)).max(8),
      }),
    )
    .min(3)
    .max(8),
});

export const titleJudgeSchema = z.object({
  summary: z.string().min(20).max(1200),
  candidates: z.array(titleCandidateSchema).min(3).max(8),
  discarded: z
    .array(
      z.object({
        title: z.string().min(3).max(220),
        reason: z.string().min(3).max(600),
      }),
    )
    .max(8),
});

export type TitleStrategyOutput = z.infer<typeof titleStrategySchema>;
export type TitleEditorialReviewOutput = z.infer<
  typeof titleEditorialReviewSchema
>;
export type TitleJudgeOutput = z.infer<typeof titleJudgeSchema>;

export const titleSearchIntentSchema = z.enum([
  'Aprender',
  'Comparar',
  'Decidir',
  'Contratar',
  'Resolver',
]);

export const titleBriefSuggestionSchema = z.object({
  summary: z.string().min(20).max(1200),
  topic: z.string().min(3).max(200),
  objective: z.string().min(10).max(600),
  audience: z.string().min(3).max(300),
  searchIntent: titleSearchIntentSchema,
  additionalContext: z.string().min(10).max(950),
  differentiation: z.string().min(10).max(450),
});

export type TitleBriefSuggestion = z.infer<typeof titleBriefSuggestionSchema>;

const sentenceEnding = /[.!?…]["'”’\])]*$/u;

function removeIncompleteTail(value: string, minimumLength: number) {
  const normalized = value.trim().replace(/,{2,}/g, ',');
  if (sentenceEnding.test(normalized)) return normalized;

  const endings = [...normalized.matchAll(/[.!?…](?=\s|$)/gu)];
  const last = endings.at(-1);
  const completed =
    last?.index === undefined ? '' : normalized.slice(0, last.index + 1).trim();
  if (completed.length < minimumLength) {
    throw new Error('El encargo editorial contiene una frase incompleta.');
  }
  return completed;
}

export function finalizeTitleBriefSuggestion(
  suggestion: TitleBriefSuggestion,
  requestedIntent: z.infer<typeof titleSearchIntentSchema>,
) {
  return titleBriefSuggestionSchema.parse({
    ...suggestion,
    searchIntent: requestedIntent,
    additionalContext: removeIncompleteTail(suggestion.additionalContext, 80),
    differentiation: removeIncompleteTail(suggestion.differentiation, 50),
  });
}

export const titleRevisionOutputSchema = z.object({
  summary: z.string().min(20).max(1200),
  revised: titleCandidateSchema,
  appliedFeedback: z.array(z.string().min(3).max(500)).min(1).max(8),
});

export const titleBriefSnapshotSchema = z.object({
  request: z.object({
    campaignYear: z.number().int().min(2020).max(2100),
    campaignMonth: z.number().int().min(1).max(12),
    searchIntent: titleSearchIntentSchema,
  }),
  client: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  history: z.array(
    z.object({
      title: z.string(),
      objective: z.string(),
      searchIntent: z.string(),
      focus: z.string(),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
  activeRules: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  corrections: z.array(
    z.object({
      field: z.string(),
      beforeValue: z.string(),
      afterValue: z.string(),
      reason: z.string(),
      correctionType: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const titleRevisionSnapshotSchema = z.object({
  client: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  package: z.object({
    campaignYear: z.number().int().min(2020).max(2100),
    campaignMonth: z.number().int().min(1).max(12),
    topic: z.string(),
    folderKey: z.string(),
  }),
  proposal: titleCandidateSchema.extend({
    id: z.string().uuid(),
    version: z.number().int().min(1),
    status: z.enum(['CHANGES_REQUESTED', 'REJECTED']),
  }),
  clientFeedback: z.object({
    type: z.enum(['REQUEST_CHANGES', 'REJECT']),
    reason: z.string().min(5).max(2000),
    createdAt: z.string(),
  }),
  history: z.array(
    z.object({
      title: z.string(),
      searchIntent: z.string(),
      focus: z.string(),
    }),
  ),
  activeRules: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

export type TitleBriefSnapshot = z.infer<typeof titleBriefSnapshotSchema>;
export type TitleRevisionOutput = z.infer<typeof titleRevisionOutputSchema>;
export type TitleRevisionSnapshot = z.infer<typeof titleRevisionSnapshotSchema>;

export const titleGenerationSnapshotSchema = z.object({
  request: z.object({
    topic: z.string(),
    objective: z.string(),
    audience: z.string(),
    searchIntent: z.string(),
    campaignYear: z.number().int().min(2020).max(2100),
    campaignMonth: z.number().int().min(1).max(12),
    count: z.union([z.literal(4), z.literal(5), z.literal(8)]),
    additionalContext: z.string().nullable(),
  }),
  client: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  history: z.array(
    z.object({
      title: z.string(),
      objective: z.string(),
      searchIntent: z.string(),
      focus: z.string(),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
  activeRules: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  corrections: z.array(
    z.object({
      field: z.string(),
      beforeValue: z.string(),
      afterValue: z.string(),
      reason: z.string(),
      correctionType: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type TitleGenerationSnapshot = z.infer<
  typeof titleGenerationSnapshotSchema
>;

const noteBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    type: z.literal('heading'),
    text: z.string().min(2).max(500),
    level: z.number().int().min(2).max(4),
  }),
  z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    type: z.enum(['paragraph', 'quote', 'callout']),
    text: z.string().min(2).max(20_000),
  }),
  z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    type: z.enum(['bullet_list', 'ordered_list']),
    items: z.array(z.string().min(2).max(2_000)).min(2).max(20),
  }),
]);

export const noteDraftSchema = z.object({
  summary: z.string().min(20).max(1200),
  title: z.string().min(10).max(220),
  metaTitle: z.string().min(10).max(220),
  metaDescription: z.string().min(40).max(320),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(240),
  excerpt: z.string().min(20).max(800),
  authorName: z.string().min(2).max(160),
  authorRole: z.string().min(2).max(160),
  ctaText: z.string().min(5).max(300),
  imageProposal: z
    .object({
      concept: z.string().min(10).max(1000),
      prompt: z.string().min(20).max(3000),
      altText: z.string().min(8).max(320),
      caption: z.string().max(600).nullable(),
      referenceUrl: z.string().url().max(2048).nullable(),
    })
    .optional(),
  content: z.object({
    schemaVersion: z.literal(1),
    blocks: z.array(noteBlockSchema).min(8).max(80),
  }),
  sourceUrlsUsed: z
    .array(
      z
        .string()
        .regex(/^https?:\/\/[^\s]+$/i)
        .max(1200),
    )
    .min(1)
    .max(20),
});

export const noteAuditSchema = z.object({
  summary: z.string().min(20).max(1200),
  score: z.number().int().min(0).max(100),
  findings: z.array(z.string().min(2).max(500)).max(12),
  revisedDraft: noteDraftSchema,
});

export const webResearchRecordSchema = z.object({
  text: z.string().min(20).max(30_000),
  citations: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        url: z.string().url().max(1200),
      }),
    )
    .min(1)
    .max(20),
});

export const noteGenerationSnapshotSchema = z.object({
  request: z.object({
    additionalInstructions: z.string().nullable(),
  }),
  client: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  note: z.object({
    id: z.string().uuid(),
    currentVersion: z.number().int().min(1),
    briefSnapshot: z.record(z.string(), z.unknown()),
    currentTitle: z.string(),
    currentDraft: z.object({
      title: z.string(),
      metaTitle: z.string().nullable(),
      metaDescription: z.string().nullable(),
      slug: z.string().nullable(),
      excerpt: z.string().nullable(),
      content: z.record(z.string(), z.unknown()),
      authorName: z.string().nullable(),
      authorRole: z.string().nullable(),
      ctaText: z.string().nullable(),
    }),
  }),
  clientFeedback: z
    .object({
      type: z.enum(['REQUEST_CHANGES', 'REJECT']),
      reason: z.string().min(5).max(2000),
      version: z.number().int().min(1),
      createdAt: z.string(),
    })
    .nullable(),
  activeRules: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  corrections: z.array(
    z.object({
      title: z.string(),
      correctionType: z.string().nullable(),
      changeReason: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export type NoteDraftOutput = z.infer<typeof noteDraftSchema>;
export type NoteAuditOutput = z.infer<typeof noteAuditSchema>;
export type NoteGenerationSnapshot = z.infer<
  typeof noteGenerationSnapshotSchema
>;
export type WebResearchRecord = z.infer<typeof webResearchRecordSchema>;
