import { Module } from '@nestjs/common';
import { ClientReviewController } from './client-review.controller';
import { ClientReviewService } from './client-review.service';
import { TitleReviewService } from './title-review.service';
import { TitlePackageReviewService } from './title-package-review.service';
import { NotePackageReviewService } from './note-package-review.service';
import { TitlesModule } from '../titles/titles.module';

@Module({
  imports: [TitlesModule],
  controllers: [ClientReviewController],
  providers: [
    ClientReviewService,
    TitleReviewService,
    TitlePackageReviewService,
    NotePackageReviewService,
  ],
})
export class ClientReviewModule {}
