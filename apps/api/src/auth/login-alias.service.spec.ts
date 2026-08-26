import { ConfigService } from '@nestjs/config';
import { LoginAliasService } from './login-alias.service';

describe('LoginAliasService', () => {
  const service = new LoginAliasService(
    new ConfigService({
      LOGIN_ALIAS_PEPPER: 'a-secret-pepper-with-at-least-32-chars',
    }),
  );

  it('normaliza el correo y genera el mismo alias sin importar mayúsculas', () => {
    const digest = service.digestEmail('  AARELLANO@GRUPOSP.PE ');
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain('aarellano@gruposp.pe');
    expect(service.digestEmail('aarellano@gruposp.pe')).toBe(digest);
  });

  it('rechaza correos inválidos', () => {
    expect(() => service.digestEmail('correo-invalido')).toThrow(
      'correo válido',
    );
  });

  it('produce un alias determinista sin conservar el DNI', () => {
    const digest = service.digestDni('12345678');
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain('12345678');
    expect(service.digestDni('12345678')).toBe(digest);
  });

  it('rechaza valores que no sean DNI de ocho dígitos', () => {
    expect(() => service.digestDni('1234')).toThrow('8 dígitos');
    expect(() => service.digestDni('12A45678')).toThrow('8 dígitos');
  });
});
