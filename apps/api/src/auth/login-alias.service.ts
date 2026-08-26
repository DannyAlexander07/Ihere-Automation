import { createHmac } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LoginAliasService {
  constructor(private readonly config: ConfigService) {}

  normalizeEmail(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (
      normalized.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw new BadRequestException('Ingresa un correo válido.');
    }
    return normalized;
  }

  digestEmail(value: string): string {
    return this.digest(this.normalizeEmail(value));
  }

  normalizeDni(value: string): string {
    const normalized = value.trim();
    if (!/^\d{8}$/.test(normalized)) {
      throw new BadRequestException(
        'El DNI debe contener exactamente 8 dígitos.',
      );
    }
    return normalized;
  }

  digestDni(value: string): string {
    return this.digest(this.normalizeDni(value));
  }

  private digest(value: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('LOGIN_ALIAS_PEPPER'),
    )
      .update(value)
      .digest('hex');
  }
}
