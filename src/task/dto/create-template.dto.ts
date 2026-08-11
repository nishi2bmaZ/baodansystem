import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class FieldDefDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsIn(['text', 'number', 'image', 'dropdown', 'date', 'checkbox'])
  type: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsString()
  placeholder?: string;
}

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsArray()
  fields: FieldDefDto[];

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: string;
}
