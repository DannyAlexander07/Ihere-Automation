import { createHmac } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LoginAliasService {
  constructor(private readonly config: ConfigService) {}

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
    const dni = this.normalizeDni(value);
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('LOGIN_ALIAS_PEPPER'),
    )
      .update(dni)
      .digest('hex');
  }
}
