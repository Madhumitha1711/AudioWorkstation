import { Module } from '@nestjs/common';
import { AudioDeviceController } from './audio-device.controller';
import { AudioDeviceService } from './audio-device.service';

@Module({
  controllers: [AudioDeviceController],
  providers: [AudioDeviceService],
})
export class AudioDeviceModule {}
