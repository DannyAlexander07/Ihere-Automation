import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const allowedBlockTypes = new Set([
  'heading',
  'paragraph',
  'bullet_list',
  'ordered_list',
  'quote',
  'callout',
]);

@Injectable()
export class NoteContentService {
  empty(): Prisma.InputJsonObject {
    return { schemaVersion: 1, blocks: [] };
  }

  validate(value: Record<string, unknown>): Prisma.InputJsonObject {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > 400_000) {
      throw new BadRequestException('El contenido supera el límite permitido.');
    }
    if (value.schemaVersion !== 1 || !Array.isArray(value.blocks)) {
      throw new BadRequestException(
        'El contenido requiere schemaVersion 1 y una lista de bloques.',
      );
    }
    if (value.blocks.length > 200) {
      throw new BadRequestException('La nota no puede superar 200 bloques.');
    }
    value.blocks.forEach((block, index) => this.validateBlock(block, index));
    const blockIds = value.blocks.map(
      (block) => (block as Record<string, unknown>).id,
    );
    if (new Set(blockIds).size !== blockIds.length) {
      throw new BadRequestException(
        'Cada bloque debe tener un identificador único.',
      );
    }
    return value as Prisma.InputJsonObject;
  }

  hash(content: object): string {
    return createHash('sha256')
      .update(this.canonicalJson(content))
      .digest('hex');
  }

  wordCount(content: Record<string, unknown>): number {
    const blocks = Array.isArray(content.blocks) ? content.blocks : [];
    const text = blocks
      .flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const block = value as Record<string, unknown>;
        if (Array.isArray(block.items)) {
          const items: unknown[] = block.items;
          return items.filter(
            (item): item is string => typeof item === 'string',
          );
        }
        return typeof block.text === 'string' ? [block.text] : [];
      })
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim();
    return text ? text.split(/\s+/u).length : 0;
  }

  private validateBlock(value: unknown, index: number): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`El bloque ${index + 1} no es válido.`);
    }
    const block = value as Record<string, unknown>;
    if (
      typeof block.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(block.id) ||
      typeof block.type !== 'string' ||
      !allowedBlockTypes.has(block.type)
    ) {
      throw new BadRequestException(
        `El bloque ${index + 1} no tiene id o tipo válido.`,
      );
    }
    const allowedKeys = new Set(
      block.type === 'heading'
        ? ['id', 'type', 'text', 'level']
        : block.type === 'bullet_list' || block.type === 'ordered_list'
          ? ['id', 'type', 'items']
          : ['id', 'type', 'text'],
    );
    const unexpectedKeys = Object.keys(block).filter(
      (key) => !allowedKeys.has(key),
    );
    if (unexpectedKeys.length) {
      throw new BadRequestException(
        `El bloque ${index + 1} contiene propiedades no permitidas: ${unexpectedKeys.join(', ')}.`,
      );
    }
    if (block.type === 'bullet_list' || block.type === 'ordered_list') {
      if (
        !Array.isArray(block.items) ||
        block.items.length > 100 ||
        block.items.some(
          (item) => typeof item !== 'string' || item.length > 2_000,
        )
      ) {
        throw new BadRequestException(
          `La lista del bloque ${index + 1} no es válida.`,
        );
      }
      return;
    }
    if (typeof block.text !== 'string' || block.text.length > 20_000) {
      throw new BadRequestException(
        `El texto del bloque ${index + 1} no es válido.`,
      );
    }
    if (block.type === 'heading' && ![2, 3, 4].includes(Number(block.level))) {
      throw new BadRequestException(
        `El encabezado ${index + 1} requiere nivel 2, 3 o 4.`,
      );
    }
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map(
          (key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
