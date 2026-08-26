import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { LoginAliasService } from '../auth/login-alias.service';
import { PrismaService } from '../database/prisma.service';

interface CreateUserInput {
  tenantId: string;
  dni?: string;
  displayName: string;
  email?: string;
  password: string;
  mfaRequired?: boolean;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: LoginAliasService,
  ) {}

  async createUser(input: CreateUserInput) {
    if (!input.email && !input.dni) {
      throw new ConflictException('El correo de acceso es obligatorio.');
    }
    const email = input.email
      ? this.aliases.normalizeEmail(input.email)
      : undefined;
    const loginAliasDigest = email
      ? this.aliases.digestEmail(email)
      : this.aliases.digestDni(input.dni!);
    const existing = await this.prisma.user.findUnique({
      where: {
        tenantId_loginAliasDigest: {
          tenantId: input.tenantId,
          loginAliasDigest,
        },
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('El alias de acceso ya está registrado.');

    const passwordHash = await hash(input.password, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    return this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        loginAliasDigest,
        displayName: input.displayName,
        email,
        passwordHash,
        mfaRequired: input.mfaRequired ?? false,
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
