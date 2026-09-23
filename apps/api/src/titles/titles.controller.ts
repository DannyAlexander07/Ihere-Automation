import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireTenantPermissions } from '../common/decorators/tenant-permissions.decorator';
import { CreateTitleDto } from './dto/create-title.dto';
import { DeleteTitleFolderDto } from './dto/delete-title-folder.dto';
import { ExportTitleFolderDto } from './dto/export-title-folder.dto';
import { InternalTitlePackageDecisionDto } from './dto/internal-title-package-decision.dto';
import { ListTitlesDto } from './dto/list-titles.dto';
import { TitleDecisionDto } from './dto/title-decision.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { VersionCommandDto } from './dto/version-command.dto';
import { TitlesService } from './titles.service';
import { TitleFolderExportService } from './title-folder-export.service';

@ApiTags('Automatización de títulos')
@ApiBearerAuth()
@Controller('titles')
export class TitlesController {
  constructor(
    private readonly titles: TitlesService,
    private readonly folderExports: TitleFolderExportService,
  ) {}

  @Get()
  @RequirePermissions('titles.read')
  list(@Query() query: ListTitlesDto, @CurrentUser() principal: AuthPrincipal) {
    return this.titles.list(query, principal);
  }

  @Delete('folders')
  @RequireTenantPermissions('titles.delete')
  removeFolder(
    @Body() input: DeleteTitleFolderDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.removeFolder(input, principal);
  }

  @Post('export-folder')
  @RequirePermissions('titles.read')
  async exportFolder(
    @Body() input: ExportTitleFolderDto,
    @CurrentUser() principal: AuthPrincipal,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.folderExports.render(input, principal);
    const fallback = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return reply
      .header('content-type', file.mimeType)
      .header('content-length', String(file.buffer.byteLength))
      .header(
        'content-disposition',
        `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      )
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .send(file.buffer);
  }

  @Delete(':id')
  @RequireTenantPermissions('titles.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.remove(id, principal);
  }

  @Post('packages/:generationRunId/internal-review')
  internalPackageReview(
    @Param('generationRunId', ParseUUIDPipe) generationRunId: string,
    @Body() input: InternalTitlePackageDecisionDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.decidePackage(generationRunId, input, principal);
  }

  @Get(':id')
  @RequirePermissions('titles.read')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.get(id, principal);
  }

  @Post()
  @RequirePermissions('titles.create')
  create(
    @Body() input: CreateTitleDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.create(input, principal);
  }

  @Patch(':id')
  @RequirePermissions('titles.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTitleDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.update(id, input, principal);
  }

  @Post(':id/submit')
  @RequirePermissions('titles.edit')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: VersionCommandDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.submit(id, input.expectedVersion, principal);
  }

  @Post(':id/revisions/evaluate')
  @RequirePermissions('titles.edit', 'titles.evaluate')
  updateAndQueueEvaluation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTitleDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.updateAndQueueEvaluation(id, input, principal);
  }

  @Post(':id/evaluations')
  @RequirePermissions('titles.evaluate')
  queueEvaluation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: VersionCommandDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.queueEvaluation(id, input.expectedVersion, principal);
  }

  @Post(':id/decisions')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TitleDecisionDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.titles.decide(id, input, principal);
  }
}
