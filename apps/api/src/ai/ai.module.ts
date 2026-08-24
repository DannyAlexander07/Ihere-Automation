import { Module } from '@nestjs/common';
import { AiGenerationController } from './ai-generation.controller';
import { AiGenerationOutboxDispatcherService } from './ai-generation-outbox-dispatcher.service';
import { AiGenerationProcessorService } from './ai-generation-processor.service';
import { AiGenerationQueueService } from './ai-generation-queue.service';
import { AiGenerationService } from './ai-generation.service';
import { AiGenerationWorkerService } from './ai-generation-worker.service';
import { AiPricingService } from './ai-pricing.service';
import { OpenAiProviderService } from './openai-provider.service';
import { NoteContentService } from '../notes/note-content.service';

@Module({
  controllers: [AiGenerationController],
  providers: [
    AiGenerationService,
    AiGenerationQueueService,
    AiGenerationProcessorService,
    AiGenerationWorkerService,
    AiGenerationOutboxDispatcherService,
    AiPricingService,
    OpenAiProviderService,
    NoteContentService,
  ],
  exports: [AiGenerationService, OpenAiProviderService, AiPricingService],
})
export class AiModule {}
