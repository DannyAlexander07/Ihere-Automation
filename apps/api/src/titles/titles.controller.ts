import {
  Body,
  Controller,
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
import { CreateTitleDto } from './dto/create-title.dto';
import { ListTitlesDto } from './dto/list-titles.dto';
import { TitleDecisionDto } from './dto/title-decision.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { VersionCommandDto } from './dto/version-command.dto';
import { TitlesService } from './titles.service';

@ApiTags('Automatización de títulos')
@ApiBearerAuth()
@Controller('titles')
export class TitlesController {
  constructor(private readonly titles: TitlesService) {}

  @Get()
  @RequirePermissions('titles.read')
  list(@Query() query: ListTitlesDto, @CurrentUser() principal: AuthPrincipal) {
    return this.titles.list(query, principal);
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
