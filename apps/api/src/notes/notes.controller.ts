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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireTenantPermissions } from '../common/decorators/tenant-permissions.decorator';
import { CreateNoteDto } from './dto/create-note.dto';
import { DeleteNoteFolderDto } from './dto/delete-note-folder.dto';
import { ListNotesDto } from './dto/list-notes.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NoteVersionCommandDto } from './dto/note-version-command.dto';
import { NoteDecisionDto } from './dto/note-decision.dto';
import { NotesService } from './notes.service';
import { UpdateNoteImageProposalDto } from './dto/update-note-image-proposal.dto';
import { NoteImageDecisionDto } from './dto/note-image-decision.dto';

@ApiTags('Automatización de notas')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @RequirePermissions('notes.read')
  list(@Query() query: ListNotesDto, @CurrentUser() principal: AuthPrincipal) {
    return this.notes.list(query, principal);
  }

  @Delete('folders')
  @RequireTenantPermissions('notes.delete')
  removeFolder(
    @Body() input: DeleteNoteFolderDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.removeFolder(input, principal);
  }

  @Delete(':id')
  @RequireTenantPermissions('notes.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.remove(id, principal);
  }

  @Get(':id')
  @RequirePermissions('notes.read')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.get(id, principal);
  }

  @Post()
  @RequirePermissions('notes.create')
  create(
    @Body() input: CreateNoteDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.create(input, principal);
  }

  @Patch(':id')
  @RequirePermissions('notes.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateNoteDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.update(id, input, principal);
  }

  @Post(':id/qa')
  @RequirePermissions('notes.qa')
  queueQa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: NoteVersionCommandDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.queueQa(id, input.expectedVersion, principal);
  }

  @Post(':id/decisions')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: NoteDecisionDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.decide(id, input, principal);
  }

  @Get(':id/image-proposal')
  @RequirePermissions('notes.read')
  imageProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.imageProposal(id, principal);
  }

  @Patch(':id/image-proposal')
  @RequirePermissions('notes.edit')
  updateImageProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateNoteImageProposalDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.updateImageProposal(id, input, principal);
  }

  @Post(':id/image-proposal/decision')
  decideImageProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: NoteImageDecisionDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notes.decideImageProposal(id, input, principal);
  }
}
