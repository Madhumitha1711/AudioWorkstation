import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Plain root health-check route ("is the server up") — left reachable
  // without a token even though JwtAuthGuard now guards everything else by
  // default (see AuthModule).
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
