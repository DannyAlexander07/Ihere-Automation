import { Module } from '@nestjs/common';
import { TitleWorkflowService } from './title-workflow.service';
import { TitlesController } from './titles.controller';
import { TitlesService } from './titles.service';
import { EvaluationOutboxDispatcherService } from './evaluation-outbox-dispatcher.service';
import { TitleEvaluationProcessorService } from './title-evaluation-processor.service';
import { TitleEvaluationQueueService } from './title-evaluation-queue.service';
import { TitleEvaluationWorkerService } from './title-evaluation-worker.service';
import { TitleRuleEvaluatorService } from './title-rule-evaluator.service';
import { TitleSimilarityService } from './title-similarity.service';

@Module({
  controllers: [TitlesController],
  providers: [
    TitlesService,
    TitleWorkflowService,
    TitleSimilarityService,
    TitleRuleEvaluatorService,
    TitleEvaluationProcessorService,
    TitleEvaluationQueueService,
    TitleEvaluationWorkerService,
    EvaluationOutboxDispatcherService,
  ],
  exports: [TitleEvaluationQueueService, TitleWorkflowService],
})
export class TitlesModule {}
