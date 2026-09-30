import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AudioDeviceModule } from './audio-device/audio-device.module';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { DatabaseModule } from './database/database.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { PaymentsModule } from './payments/payments.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    PaymentsModule,
    CoursesModule,
    DiscussionsModule,
    AudioDeviceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
