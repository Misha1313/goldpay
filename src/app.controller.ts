import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import path from 'path';
import fs from 'fs';
import { Public } from './business/auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor() {}

  @Get('health')
  health() {
    return 'OK';
  }

  @Get('/')
  getRoot() {
    return 'OK';
  }

  @Public()
  @Get('files')
  getFiles() {
    const dir = path.join(process.cwd(), 'dist');
    const walk = (dirPath: string): any => {
      return fs.readdirSync(dirPath).map((file) => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        return stat.isDirectory() ? { [file]: walk(filePath) } : file;
      });
    };

    return walk(dir);
  }
}
