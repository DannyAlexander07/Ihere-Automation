import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsClientDto } from './dto/analytics-client.dto';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { ConfigureAnalyticsDto } from './dto/configure-analytics.dto';
import { ConfirmPublicationDto } from './dto/confirm-publication.dto';
import { CreatePublicationDto } from './dto/create-publication.dto';
import { CreateResultsLinkDto } from './dto/create-results-link.dto';
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto';
import { StartGoogleOAuthDto } from './dto/start-google-oauth.dto';
import { SyncAnalyticsDto } from './dto/sync-analytics.dto';

@ApiTags('Resultados y analítica')
@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
  ) {}

  @Get('analytics/clients')
  @ApiBearerAuth()
  @RequirePermissions('analytics.read')
  clients(@CurrentUser() principal: AuthPrincipal) {
    return this.analytics.clients(principal);
  }

  @Get('analytics/connections/:clientId')
  @ApiBearerAuth()
  @RequirePermissions('analytics.read')
  connection(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.connection(clientId, principal);
  }

  @Get('analytics/connections/:clientId/sources')
  @ApiBearerAuth()
  @RequirePermissions('analytics.manage')
  sources(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.sources(clientId, principal);
  }

  @Post('analytics/google/oauth/start')
  @ApiBearerAuth()
  @RequirePermissions('analytics.manage')
  startOAuth(
    @Body() input: StartGoogleOAuthDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.startOAuth(input, principal);
  }

  @Get(['analytics/oauth/google/callback', 'analytics/google/oauth/callback'])
  @Public()
  async callback(
    @Query() query: GoogleOAuthCallbackDto,
    @Res() reply: FastifyReply,
  ) {
    const path = await this.analytics.completeOAuth(query.state, query.code);
    const target = new URL(
      path,
      this.config.getOrThrow<string>('PUBLIC_WEB_URL'),
    );
    return reply.redirect(target.toString());
  }

  @Patch('analytics/connections/:clientId')
  @ApiBearerAuth()
  @RequirePermissions('analytics.manage')
  configure(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() input: ConfigureAnalyticsDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.configure(clientId, input, principal);
  }

  @Post('analytics/connections/:clientId/sync')
  @ApiBearerAuth()
  @RequirePermissions('analytics.manage')
  sync(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() input: SyncAnalyticsDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.sync(clientId, input, principal);
  }

  @Get('analytics/summary')
  @ApiBearerAuth()
  @RequirePermissions('analytics.read')
  summary(
    @Query() input: AnalyticsSummaryDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.summary(
      input.clientId,
      input.days ?? 28,
      principal,
      input.startDate,
      input.endDate,
    );
  }

  @Get('analytics/publications')
  @ApiBearerAuth()
  @RequirePermissions('analytics.read')
  publications(
    @Query() input: AnalyticsClientDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.publications(input.clientId, principal);
  }

  @Post('analytics/publications')
  @ApiBearerAuth()
  @RequirePermissions('analytics.manage')
  createPublication(
    @Body() input: CreatePublicationDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.createPublication(input, principal);
  }

  @Patch('analytics/publications/:id/confirm')
  @ApiBearerAuth()
  @RequirePermissions('analytics.manage')
  confirmPublication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ConfirmPublicationDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.confirmPublication(id, input, principal);
  }

  @Post('results-links')
  @ApiBearerAuth()
  @RequirePermissions('results_links.manage')
  createResultsLink(
    @Body() input: CreateResultsLinkDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.createResultsLink(input, principal);
  }

  @Get('results-links')
  @ApiBearerAuth()
  @RequirePermissions('results_links.manage')
  listResultsLinks(
    @Query() input: AnalyticsClientDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.listResultsLinks(input.clientId, principal);
  }

  @Patch('results-links/:id/revoke')
  @ApiBearerAuth()
  @RequirePermissions('results_links.manage')
  revokeResultsLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.analytics.revokeResultsLink(id, principal);
  }

  @Get('public/results/current')
  @Public()
  publicResults(@Headers('x-results-token') token: string) {
    return this.analytics.publicResults(token ?? '');
  }
}
