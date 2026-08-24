import type { ExportFormat, NoteSourceType } from '../generated/prisma/client';

export type ExportBlock = {
  id: string;
  type:
    | 'heading'
    | 'paragraph'
    | 'bullet_list'
    | 'ordered_list'
    | 'quote'
    | 'callout';
  text?: string;
  level?: 2 | 3 | 4;
  items?: string[];
};

export type ExportSource = {
  type: NoteSourceType;
  title: string;
  entity: string;
  url: string;
  publishedAt: Date | null;
  accessedAt: Date;
};

export type ExportInput = {
  format: ExportFormat;
  tenantId: string;
  clientId: string;
  clientName: string;
  noteId: string;
  version: number;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string | null;
  excerpt: string | null;
  authorName: string | null;
  authorRole: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  internalLinks: string[];
  blocks: ExportBlock[];
  sources: ExportSource[];
};

export type RenderedExport = {
  buffer: Buffer;
  extension: 'html' | 'docx' | 'pdf';
  mimeType: string;
};
