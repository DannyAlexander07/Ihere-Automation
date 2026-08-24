import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { AiUsage } from './ai-pricing.service';

export type StructuredGeneration<T> = {
  output: T;
  usage: AiUsage;
  responseId: string;
};

export type WebResearchGeneration = {
  text: string;
  citations: Array<{ title: string; url: string }>;
  usage: AiUsage;
  responseId: string;
};

@Injectable()
export class OpenAiProviderService {
  private client?: OpenAI;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get<boolean>('AI_GENERATION_ENABLED') &&
      this.config.get<string>('OPENAI_API_KEY'),
    );
  }

  get primaryModel(): string {
    return this.config.getOrThrow<string>('AI_PRIMARY_MODEL');
  }

  get reasoningEffort(): 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
    return this.config.getOrThrow('AI_REASONING_EFFORT');
  }

  async structured<TSchema extends z.ZodType>(input: {
    schema: TSchema;
    schemaName: string;
    system: string;
    user: string;
    runId: string;
    stage: string;
    tenantId: string;
    userId: string;
    deadline: number;
    maxOutputTokens?: number;
  }): Promise<StructuredGeneration<z.infer<TSchema>>> {
    this.assertEnabled();
    const remaining = input.deadline - Date.now();
    if (remaining <= 0) throw new Error('La generación excedió su plazo.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    timer.unref();
    try {
      const response = await this.getClient().responses.parse(
        {
          model: this.primaryModel,
          store: false,
          safety_identifier: this.safetyIdentifier(
            input.tenantId,
            input.userId,
          ),
          reasoning: { effort: this.reasoningEffort },
          max_output_tokens:
            input.maxOutputTokens ??
            this.config.getOrThrow<number>('AI_MAX_OUTPUT_TOKENS'),
          input: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          text: {
            format: zodTextFormat(input.schema, input.schemaName),
            verbosity: 'medium',
          },
        },
        {
          signal: controller.signal,
          idempotencyKey: `${input.runId}:${input.stage}`,
        },
      );
      if (!response.output_parsed) {
        throw new Error(
          response.status === 'incomplete'
            ? 'El servicio editorial devolvió una respuesta incompleta.'
            : 'El servicio editorial no devolvió una salida estructurada válida.',
        );
      }
      return {
        output: response.output_parsed as z.infer<TSchema>,
        usage: this.usage(response),
        responseId: response.id,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async webResearch(input: {
    system: string;
    user: string;
    runId: string;
    stage: string;
    tenantId: string;
    userId: string;
    deadline: number;
  }): Promise<WebResearchGeneration> {
    this.assertEnabled();
    const remaining = input.deadline - Date.now();
    if (remaining <= 0) throw new Error('La investigación excedió su plazo.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    timer.unref();
    try {
      const response = await this.getClient().responses.create(
        {
          model: this.primaryModel,
          store: false,
          safety_identifier: this.safetyIdentifier(
            input.tenantId,
            input.userId,
          ),
          reasoning: { effort: this.reasoningEffort },
          max_output_tokens: 4_000,
          input: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          tools: [{ type: 'web_search', search_context_size: 'medium' }],
          tool_choice: 'auto',
          include: ['web_search_call.action.sources'],
        },
        {
          signal: controller.signal,
          idempotencyKey: `${input.runId}:${input.stage}`,
        },
      );
      const citations = this.extractCitations(response.output);
      if (!response.output_text.trim() || citations.length < 1) {
        throw new Error(
          'La investigación no devolvió texto respaldado por fuentes citables.',
        );
      }
      return {
        text: response.output_text,
        citations,
        usage: this.usage(response),
        responseId: response.id,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private usage(response: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    } | null;
    output: Array<{ type: string }>;
  }): AiUsage {
    return {
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      webSearchCalls: response.output.filter(
        (item) => item.type === 'web_search_call',
      ).length,
    };
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
        maxRetries: 2,
        timeout: this.config.getOrThrow<number>('AI_GENERATION_TIMEOUT_MS'),
      });
    }
    return this.client;
  }

  private extractCitations(value: unknown) {
    const found = new Map<string, { title: string; url: string }>();
    const visit = (item: unknown): void => {
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      if (!item || typeof item !== 'object') return;
      const record = item as Record<string, unknown>;
      if (
        record.type === 'url_citation' &&
        typeof record.url === 'string' &&
        /^https?:\/\//i.test(record.url)
      ) {
        found.set(record.url, {
          url: record.url,
          title:
            typeof record.title === 'string' && record.title.trim()
              ? record.title.trim().slice(0, 300)
              : new URL(record.url).hostname,
        });
      }
      Object.values(record).forEach(visit);
    };
    visit(value);
    return [...found.values()].slice(0, 20);
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'La automatización editorial no está habilitada en este entorno.',
      );
    }
  }

  private safetyIdentifier(tenantId: string, userId: string): string {
    return createHash('sha256')
      .update(`ihere:${tenantId}:${userId}`)
      .digest('hex');
  }
}
