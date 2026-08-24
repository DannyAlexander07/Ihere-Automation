import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  DuplicateResolution,
  EvaluationStatus,
  EvaluationVerdict,
  TitleDecisionType,
  TitleStatus,
} from '../generated/prisma/client';

const editableStatuses = new Set<TitleStatus>([
  TitleStatus.DRAFT,
  TitleStatus.PROPOSED,
  TitleStatus.CHANGES_REQUESTED,
]);

@Injectable()
export class TitleWorkflowService {
  assertEditable(status: TitleStatus): void {
    if (!editableStatuses.has(status)) {
      throw new ConflictException(
        'Este título es terminal y no puede editarse; crea una nueva propuesta.',
      );
    }
  }

  assertCanQueueEvaluation(status: TitleStatus): void {
    if (
      !(
        [TitleStatus.PROPOSED, TitleStatus.CHANGES_REQUESTED] as TitleStatus[]
      ).includes(status)
    ) {
      throw new ConflictException(
        'Solo se evalúan títulos propuestos o con cambios solicitados.',
      );
    }
  }

  assertCanResolveDuplicate(
    status: TitleStatus,
    duplicateScore: number,
    duplicateResolution: DuplicateResolution,
  ): void {
    if (
      !(
        [TitleStatus.PROPOSED, TitleStatus.CHANGES_REQUESTED] as TitleStatus[]
      ).includes(status)
    ) {
      throw new ConflictException(
        'La duplicidad solo puede resolverse en una propuesta activa.',
      );
    }
    if (
      duplicateScore < 75 ||
      duplicateResolution !== DuplicateResolution.PENDING
    ) {
      throw new ConflictException(
        'La propuesta no tiene una duplicidad pendiente por resolver.',
      );
    }
  }

  statusForDecision(type: TitleDecisionType): TitleStatus {
    const mapping: Record<TitleDecisionType, TitleStatus | null> = {
      APPROVE: TitleStatus.APPROVED,
      REJECT: TitleStatus.REJECTED,
      REQUEST_CHANGES: TitleStatus.CHANGES_REQUESTED,
      MARK_USED: TitleStatus.USED,
      RESOLVE_DUPLICATE: null,
    };
    const status = mapping[type];
    if (!status)
      throw new BadRequestException(
        'La resolución de duplicidad no cambia el estado editorial.',
      );
    return status;
  }

  assertCanDecide(
    currentStatus: TitleStatus,
    type: TitleDecisionType,
    duplicateScore: number,
    duplicateResolution: DuplicateResolution,
    evaluation?: {
      status: EvaluationStatus;
      verdict: EvaluationVerdict | null;
      overallScore: number | null;
    },
  ): void {
    if (
      type === TitleDecisionType.MARK_USED &&
      currentStatus !== TitleStatus.APPROVED
    ) {
      throw new ConflictException(
        'Solo un título aprobado puede marcarse como utilizado.',
      );
    }
    if (
      (
        [
          TitleDecisionType.REJECT,
          TitleDecisionType.REQUEST_CHANGES,
        ] as TitleDecisionType[]
      ).includes(type) &&
      !(
        [
          TitleStatus.PROPOSED,
          TitleStatus.EVALUATING,
          TitleStatus.CHANGES_REQUESTED,
        ] as TitleStatus[]
      ).includes(currentStatus)
    ) {
      throw new ConflictException('El estado actual no admite esa decisión.');
    }
    if (type !== TitleDecisionType.APPROVE) return;
    if (
      !(
        [TitleStatus.PROPOSED, TitleStatus.EVALUATING] as TitleStatus[]
      ).includes(currentStatus)
    ) {
      throw new ConflictException(
        'Solo una propuesta evaluada puede aprobarse.',
      );
    }
    if (
      !evaluation ||
      evaluation.status !== EvaluationStatus.COMPLETED ||
      evaluation.verdict === EvaluationVerdict.BLOCK ||
      evaluation.verdict === EvaluationVerdict.ERROR ||
      (evaluation.overallScore ?? 0) < 80
    ) {
      throw new ConflictException(
        'La aprobación exige una evaluación completa, sin bloqueo y con 80 puntos o más.',
      );
    }
    if (
      duplicateScore >= 75 &&
      duplicateResolution === DuplicateResolution.PENDING
    ) {
      throw new ConflictException(
        'Debe resolverse la posible duplicidad antes de aprobar.',
      );
    }
    if (duplicateResolution === DuplicateResolution.DISCARD) {
      throw new ConflictException(
        'Una propuesta descartada por duplicidad no puede aprobarse.',
      );
    }
  }
}
