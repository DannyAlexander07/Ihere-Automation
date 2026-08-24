import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { AuthService, type AuthResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangeOwnCredentialsDto } from './dto/change-own-credentials.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

const REFRESH_COOKIE = 'ihere_refresh';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.withRefreshCookie(
      reply,
      await this.auth.login(input, this.context(request)),
    );
  }

  @Public()
  // The web client deliberately keeps the access token in memory. Every full
  // reload therefore performs one cookie-backed refresh, so a user checking
  // several responsive routes in quick succession must not be logged out.
  // Login remains protected by the stricter five-attempt limit above.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.withRefreshCookie(
      reply,
      await this.auth.refresh(
        request.cookies[REFRESH_COOKIE],
        this.context(request),
      ),
    );
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(
      request.cookies[REFRESH_COOKIE],
      this.context(request),
    );
    reply.clearCookie(REFRESH_COOKIE, { path: this.cookiePath() });
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() principal: AuthPrincipal) {
    return this.auth.me(principal);
  }

  @Patch('me/profile')
  @ApiBearerAuth()
  updateProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: UpdateOwnProfileDto,
  ) {
    return this.auth.updateOwnProfile(principal, input);
  }

  @Patch('me/credentials')
  @ApiBearerAuth()
  changeCredentials(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: ChangeOwnCredentialsDto,
  ) {
    return this.auth.changeOwnCredentials(principal, input);
  }

  private withRefreshCookie(reply: FastifyReply, result: AuthResult) {
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: 'strict',
      path: this.cookiePath(),
      maxAge: this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 86_400,
    });
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  private cookiePath(): string {
    return `/${this.config.getOrThrow<string>('API_PREFIX')}/auth`;
  }

  private context(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.ihereRequestId,
    };
  }
}
