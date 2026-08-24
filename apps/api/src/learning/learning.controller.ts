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
import { RequireTenantPermissions } from '../common/decorators/tenant-permissions.decorator';
import { CreateLearningRuleDto } from './dto/create-learning-rule.dto';
import { ListLearningDto } from './dto/list-learning.dto';
import { UpdateLearningRuleStatusDto } from './dto/update-learning-rule-status.dto';
import { LearningService } from './learning.service';

@ApiTags('Aprendizaje editorial controlado')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('signals')
  @RequirePermissions('learning.read')
  signals(
    @Query() query: ListLearningDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.learning.signals(query, principal);
  }

  @Get('rules')
  @RequirePermissions('learning.read')
  rules(
    @Query() query: ListLearningDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.learning.rules(query, principal);
  }

  @Post('rules')
  @RequirePermissions('learning.manage')
  createRule(
    @Body() input: CreateLearningRuleDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.learning.createRule(input, principal);
  }

  @Patch('rules/:id/status')
  @RequirePermissions('learning.approve')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateLearningRuleStatusDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.learning.setStatus(id, input.status, principal);
  }

  @Post('rules/:id/restore')
  @RequireTenantPermissions('learning.restore')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.learning.restore(id, principal);
  }
}
