import {
  DuplicateResolution,
  EvaluationStatus,
  EvaluationVerdict,
  TitleDecisionType,
  TitleStatus,
} from '../generated/prisma/client';
import { TitleWorkflowService } from './title-workflow.service';

describe('TitleWorkflowService', () => {
  const workflow = new TitleWorkflowService();

  it('impide editar estados terminales', () => {
    expect(() => workflow.assertEditable(TitleStatus.APPROVED)).toThrow(
      'terminal',
    );
    expect(() => workflow.assertEditable(TitleStatus.REJECTED)).toThrow(
      'terminal',
    );
  });

  it('bloquea aprobación con duplicidad sin resolver', () => {
    expect(() =>
      workflow.assertCanDecide(
        TitleStatus.EVALUATING,
        TitleDecisionType.APPROVE,
        82,
        DuplicateResolution.PENDING,
        {
          status: EvaluationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          overallScore: 90,
        },
      ),
    ).toThrow('duplicidad');
  });

  it('permite aprobación humana si evaluación y duplicidad cumplen', () => {
    expect(() =>
      workflow.assertCanDecide(
        TitleStatus.EVALUATING,
        TitleDecisionType.APPROVE,
        20,
        DuplicateResolution.UNIQUE,
        {
          status: EvaluationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          overallScore: 88,
        },
      ),
    ).not.toThrow();
  });

  it('solo resuelve una duplicidad pendiente en una propuesta activa', () => {
    expect(() =>
      workflow.assertCanResolveDuplicate(
        TitleStatus.APPROVED,
        90,
        DuplicateResolution.PENDING,
      ),
    ).toThrow('propuesta activa');
    expect(() =>
      workflow.assertCanResolveDuplicate(
        TitleStatus.PROPOSED,
        30,
        DuplicateResolution.PENDING,
      ),
    ).toThrow('no tiene una duplicidad');
  });

  it('impide aprobar una propuesta descartada por duplicidad', () => {
    expect(() =>
      workflow.assertCanDecide(
        TitleStatus.PROPOSED,
        TitleDecisionType.APPROVE,
        88,
        DuplicateResolution.DISCARD,
        {
          status: EvaluationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          overallScore: 92,
        },
      ),
    ).toThrow('descartada');
  });
});
