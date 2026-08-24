import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityService } from './identity.service';

@Module({
  imports: [AuthModule],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
