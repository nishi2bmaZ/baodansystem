import { IsObject, IsOptional, IsArray, IsString } from 'class-validator';

export class SubmitDto {
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
