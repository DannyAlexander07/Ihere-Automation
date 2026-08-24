import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportDispatchDto } from './dto/export-dispatch.dto';
import { VerifyExportDto } from './dto/verify-export.dto';
import { ExportsService } from './exports.service';

@ApiTags('Exportaciones de notas')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get()
  @RequirePermissions('notes.export')
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.exportsService.list(principal);
  }

  @Post('notes/:noteId')
  @RequirePermissions('notes.export')
  request(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() input: CreateExportDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.exportsService.request(noteId, input, principal);
  }

  @Get(':id/download')
  @RequirePermissions('notes.export')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.exportsService.download(id, principal);
    reply
      .header('content-type', file.mimeType)
      .header('content-length', String(file.buffer.byteLength))
      .header('content-disposition', contentDisposition(file.fileName))
      .header('x-content-sha256', file.contentHash)
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .send(file.buffer);
  }

  @Post(':id/dispatch')
  @RequirePermissions('notes.export')
  markDispatched(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ExportDispatchDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.exportsService.markDispatched(id, input, principal);
  }

  @Post(':id/verify')
  @RequirePermissions('notes.export')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: VerifyExportDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.exportsService.verify(id, input, principal);
  }
}

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
