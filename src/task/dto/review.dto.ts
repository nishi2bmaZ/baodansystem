import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewDto {
  @IsIn(['approve', 'reject'])
  action: string;

  @IsOptional()
  @IsString()
  note?: string;
}
