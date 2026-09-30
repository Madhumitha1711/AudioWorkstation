import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';
import { AudioDeviceService } from './audio-device.service';
import { AudioDeviceFormat } from './audio-device.types';

// Dev-tool endpoint backing studio-vr's /audio-test page (which is itself
// a public, non-student route) — see AudioDeviceService for what it reads.
// @Public() because the tester is used without signing in.
//
// Off by default in production (the Dockerfile sets NODE_ENV=production):
// there the "device" would be the server container's, which is meaningless
// to a browser. Set AUDIO_DEVICE_INFO_ENABLED=true to force it on,
// or =false to turn it off in dev too.
@Controller('audio-device')
export class AudioDeviceController {
  constructor(
    private readonly audioDeviceService: AudioDeviceService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  getOutputFormat(): Promise<AudioDeviceFormat> {
    const flag = this.config.get<string>('AUDIO_DEVICE_INFO_ENABLED');
    const enabled =
      flag != null && flag !== ''
        ? flag === 'true'
        : process.env.NODE_ENV !== 'production';
    if (!enabled) throw new NotFoundException();
    return this.audioDeviceService.getOutputFormat();
  }
}
