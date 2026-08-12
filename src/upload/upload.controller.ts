import {
  Controller,
  Post,
  UseGuards,
  Headers,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  storage: diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (ALLOWED.includes(ext)) cb(null, true);
    else cb(new BadRequestException('仅支持图片格式: jpg/png/gif/webp'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

@Controller('upload')
export class UploadController {
  constructor() {
    fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
  }

  private buildResult(file: any) {
    if (!file) throw new BadRequestException('未收到文件');
    const base = process.env.PUBLIC_BASE || '';
    return { url: `${base}/uploads/${file.filename}`, filename: file.filename };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  upload(@UploadedFile() file: any) {
    return this.buildResult(file);
  }

  /** 后台专用上传（模板参考图等），用 x-admin-key 校验，与后台其余接口一致 */
  @Post('admin')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  adminUpload(@Headers('x-admin-key') key: string, @UploadedFile() file: any) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.buildResult(file);
  }
}
