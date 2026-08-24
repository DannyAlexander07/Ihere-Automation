import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExportStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('EXPORT_STORAGE_DIR'));
  }

  async write(storageKey: string, buffer: Buffer): Promise<void> {
    const target = this.safePath(storageKey);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, buffer, { flag: 'wx' });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.safePath(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const info = await stat(this.safePath(storageKey));
      return info.isFile();
    } catch {
      return false;
    }
  }

  hash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private safePath(storageKey: string): string {
    if (!storageKey || storageKey.includes('\0')) {
      throw new Error('Clave de almacenamiento inválida.');
    }
    const target = resolve(this.root, storageKey);
    const relation = relative(this.root, target);
    if (!relation || relation.startsWith(`..${sep}`) || relation === '..') {
      throw new Error(
        'La clave de almacenamiento está fuera del directorio autorizado.',
      );
    }
    return target;
  }
}
