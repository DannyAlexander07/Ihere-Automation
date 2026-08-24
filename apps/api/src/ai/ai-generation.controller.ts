import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AiGenerationService } from './ai-generation.service';
import { CreateTitleGenerationDto } from './dto/create-title-generation.dto';
import { CreateTitleBriefDto } from './dto/create-title-brief.dto';
import { CreateNoteGenerationDto } from './dto/create-note-generation.dto';

@ApiTags('Generación inteligente controlada')
@ApiBearerAuth()
@Controller('ai/generations')
export class AiGenerationController {
  constructor(private readonly generations: AiGenerationService) {}

  @Post('titles')
  @RequirePermissions('ai.generate')
  generateTitles(
    @Body() input: CreateTitleGenerationDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.generations.queueTitleGeneration(input, principal);
  }

  @Post('titles/brief')
  @RequirePermissions('ai.generate')
  prepareTitleBrief(
    @Body() input: CreateTitleBriefDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.generations.queueTitleBrief(input, principal);
  }

  @Post('title-packages/:generationRunId/revise-pending')
  @RequirePermissions('ai.generate')
  revisePendingTitles(
    @Param('generationRunId', ParseUUIDPipe) generationRunId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.generations.queuePendingTitleRevisions(
      generationRunId,
      principal,
    );
  }

  @Post('notes/:noteId')
  @RequirePermissions('ai.generate')
  generateNote(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() input: CreateNoteGenerationDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.generations.queueNoteGeneration(noteId, input, principal);
  }

  @Get(':id')
  @RequirePermissions('ai.read')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.generations.get(id, principal);
  }
}
