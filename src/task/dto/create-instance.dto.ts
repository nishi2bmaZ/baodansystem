import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateInstanceDto {
  @IsInt()
  templateId: number;

  @IsString()
  title: string;

  @IsString()
  date: string; // YYYY-MM-DD

  @IsInt()
  quota: number;

  @IsString()
  startTime: string; // ISO 时间，如 2026-08-11T09:00:00.000Z

  @IsString()
  endTime: string; // ISO 时间
}
