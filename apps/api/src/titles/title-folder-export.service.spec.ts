import { TitleFolderExportService } from './title-folder-export.service';

describe('TitleFolderExportService', () => {
  const title = {
    id: 'title-1',
    title: 'Cómo mejorar la gestión de personas',
    service: 'Outsourcing',
    objective: 'Orientar una decisión informada.',
    audience: 'Líderes de recursos humanos.',
    searchIntent: 'Resolver',
    focus: 'Criterios concretos y accionables.',
    opportunity: 'Responder una consulta frecuente.',
    risk: 'Evitar promesas absolutas.',
    status: 'PROPOSED',
    currentVersion: 1,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    client: { name: 'Adecco Perú' },
    generationRun: {
      campaignYear: 2026,
      campaignMonth: 9,
      campaignTopic: 'Gestión humana',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      inputSnapshot: {},
      requestedBy: { displayName: 'Usuario de prueba' },
    },
    evaluations: [
      {
        verdict: 'PASS',
        overallScore: 92,
        summary: 'Propuesta consistente.',
        agentResults: [
          {
            agentType: 'SEO_STRATEGIST',
            verdict: 'PASS',
            score: 90,
            summary: 'Intención clara.',
            findings: ['Título específico.'],
            evidence: ['Consulta objetivo validada.'],
          },
        ],
      },
    ],
  };
  const prisma = {
    titleProposal: { findMany: jest.fn().mockResolvedValue([title]) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new TitleFolderExportService(prisma as never, audit as never);
  const principal = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    permissions: ['titles.read'],
    tenantPermissions: ['titles.read'],
    clientPermissions: {},
    requestId: 'request-1',
  };

  it.each(['DOCX', 'PDF'] as const)(
    'exporta la carpeta completa en %s',
    async (format) => {
      const rendered = await service.render(
        {
          clientId: 'client-1',
          folderKey: 'adecco/2026/09/gestion-humana',
          format,
        },
        principal as never,
      );
      expect(rendered.buffer.byteLength).toBeGreaterThan(2_000);
      expect(rendered.fileName).toMatch(
        format === 'DOCX' ? /\.docx$/ : /\.pdf$/,
      );
    },
  );
});
