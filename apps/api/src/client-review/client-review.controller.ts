import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ClientReviewService } from './client-review.service';
import { ClientReviewDecisionDto } from './dto/client-review-decision.dto';
import { CreateReviewLinkDto } from './dto/create-review-link.dto';
import { CreateTitlePackageReviewLinkDto } from './dto/create-title-package-review-link.dto';
import { ReviewDispatchDto } from './dto/review-dispatch.dto';
import { TitleReviewService } from './title-review.service';
import { TitlePackageReviewService } from './title-package-review.service';
import { TitlePackageReviewDecisionDto } from './dto/title-package-review-decision.dto';
import { NotePackageReviewService } from './note-package-review.service';
import { CreateNotePackageReviewLinkDto } from './dto/create-note-package-review-link.dto';
import { NotePackageReviewDecisionDto } from './dto/note-package-review-decision.dto';

@ApiTags('Portal seguro de revisión del cliente')
@Controller()
export class ClientReviewController {
  constructor(
    private readonly reviews: ClientReviewService,
    private readonly titleReviews: TitleReviewService,
    private readonly titlePackageReviews: TitlePackageReviewService,
    private readonly notePackageReviews: NotePackageReviewService,
  ) {}

  @Post('review-links/note-packages/:generationRunId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  createNotePackageReview(
    @Param('generationRunId', ParseUUIDPipe) generationRunId: string,
    @Body() input: CreateNotePackageReviewLinkDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notePackageReviews.create(generationRunId, input, principal);
  }

  @Get('review-links/note-packages/:generationRunId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  listNotePackageReviews(
    @Param('generationRunId', ParseUUIDPipe) generationRunId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notePackageReviews.list(generationRunId, principal);
  }

  @Patch('review-links/note-packages/:id/access')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  recoverNotePackageAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notePackageReviews.recoverAccess(id, principal);
  }

  @Patch('review-links/note-packages/:id/revoke')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  revokeNotePackageReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notePackageReviews.revoke(id, principal);
  }

  @Patch('review-links/note-packages/:id/dispatch')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  dispatchNotePackageReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewDispatchDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notePackageReviews.markDispatched(id, input, principal);
  }

  @Post('review-links/notes/:noteId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  create(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() input: CreateReviewLinkDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.reviews.create(noteId, input, principal);
  }

  @Get('review-links/notes/:noteId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  list(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.reviews.list(noteId, principal);
  }

  @Patch('review-links/notes/:id/access')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  recoverNoteAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.reviews.recoverAccess(id, principal);
  }

  @Patch('review-links/:id/revoke')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.reviews.revoke(id, principal);
  }

  @Patch('review-links/notes/:id/dispatch')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  dispatchNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewDispatchDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.reviews.markDispatched(id, input, principal);
  }

  @Post('review-links/titles/:proposalId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  createTitleReview(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() input: CreateReviewLinkDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titleReviews.create(proposalId, input, principal);
  }

  @Get('review-links/titles/:proposalId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  listTitleReviews(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titleReviews.list(proposalId, principal);
  }

  @Patch('review-links/titles/:id/access')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  recoverTitleAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titleReviews.recoverAccess(id, principal);
  }

  @Patch('review-links/titles/:id/revoke')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  revokeTitleReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titleReviews.revoke(id, principal);
  }

  @Patch('review-links/titles/:id/dispatch')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  dispatchTitleReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewDispatchDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titleReviews.markDispatched(id, input, principal);
  }

  @Post('review-links/title-packages/:generationRunId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  createTitlePackageReview(
    @Param('generationRunId', ParseUUIDPipe) generationRunId: string,
    @Body() input: CreateTitlePackageReviewLinkDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titlePackageReviews.create(generationRunId, input, principal);
  }

  @Get('review-links/title-packages/:generationRunId')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  listTitlePackageReviews(
    @Param('generationRunId', ParseUUIDPipe) generationRunId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titlePackageReviews.list(generationRunId, principal);
  }

  @Patch('review-links/title-packages/:id/access')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  recoverTitlePackageAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titlePackageReviews.recoverAccess(id, principal);
  }

  @Patch('review-links/title-packages/:id/revoke')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  revokeTitlePackageReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titlePackageReviews.revoke(id, principal);
  }

  @Patch('review-links/title-packages/:id/dispatch')
  @ApiBearerAuth()
  @RequirePermissions('review_links.manage')
  dispatchTitlePackageReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewDispatchDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titlePackageReviews.markDispatched(id, input, principal);
  }

  @Get('public/reviews/current')
  @Public()
  view(@Headers('x-review-token') token: string) {
    return this.reviews.publicView(token ?? '');
  }

  @Get('public/note-package-reviews/current')
  @Public()
  viewNotePackage(@Headers('x-review-token') token: string) {
    return this.notePackageReviews.publicView(token ?? '');
  }

  @Post('public/note-package-reviews/current/decision')
  @Public()
  decideNotePackage(
    @Headers('x-review-token') token: string,
    @Body() input: NotePackageReviewDecisionDto,
    @Req() request: FastifyRequest,
  ) {
    return this.notePackageReviews.decide(token ?? '', input, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('public/reviews/current/decision')
  @Public()
  decide(
    @Headers('x-review-token') token: string,
    @Body() input: ClientReviewDecisionDto,
    @Req() request: FastifyRequest,
  ) {
    return this.reviews.decide(token ?? '', input, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Get('public/title-reviews/current')
  @Public()
  viewTitle(@Headers('x-review-token') token: string) {
    return this.titleReviews.publicView(token ?? '');
  }

  @Post('public/title-reviews/current/decision')
  @Public()
  decideTitle(
    @Headers('x-review-token') token: string,
    @Body() input: ClientReviewDecisionDto,
    @Req() request: FastifyRequest,
  ) {
    return this.titleReviews.decide(token ?? '', input, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Get('public/title-package-reviews/current')
  @Public()
  viewTitlePackage(@Headers('x-review-token') token: string) {
    return this.titlePackageReviews.publicView(token ?? '');
  }

  @Post('public/title-package-reviews/current/decision')
  @Public()
  decideTitlePackage(
    @Headers('x-review-token') token: string,
    @Body() input: TitlePackageReviewDecisionDto,
    @Req() request: FastifyRequest,
  ) {
    return this.titlePackageReviews.decide(token ?? '', input, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
