import { Module } from '@nestjs/common';
import { RelationService } from './relation.service';
import { RelationController } from './relation.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RelationController],
  providers: [RelationService],
  exports: [RelationService],
})
export class RelationModule {}
