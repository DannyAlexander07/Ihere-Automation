import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { NoteContentService } from './note-content.service';
import { NoteQaRulesService } from './note-qa-rules.service';
import { NoteQaProcessorService } from './note-qa-processor.service';
import { NoteQaQueueService } from './note-qa-queue.service';
import { NoteQaWorkerService } from './note-qa-worker.service';
import { NoteQaOutboxDispatcherService } from './note-qa-outbox-dispatcher.service';
import { NoteSimilarityService } from './note-similarity.service';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportRendererService } from './export-renderer.service';
import { ExportStorageService } from './export-storage.service';
import { ExportProcessorService } from './export-processor.service';
import { ExportQueueService } from './export-queue.service';
import { ExportWorkerService } from './export-worker.service';
import { ExportOutboxDispatcherService } from './export-outbox-dispatcher.service';

@Module({
  controllers: [NotesController, ExportsController],
  providers: [
    NotesService,
    NoteContentService,
    NoteQaRulesService,
    NoteQaProcessorService,
    NoteQaQueueService,
    NoteQaWorkerService,
    NoteQaOutboxDispatcherService,
    NoteSimilarityService,
    ExportsService,
    ExportRendererService,
    ExportStorageService,
    ExportProcessorService,
    ExportQueueService,
    ExportWorkerService,
    ExportOutboxDispatcherService,
  ],
  exports: [ExportProcessorService],
})
export class NotesModule {}
