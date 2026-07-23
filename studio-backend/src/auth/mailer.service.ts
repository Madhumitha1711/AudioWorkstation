import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Sends the forgot-password six-digit code by email via AWS SES.
//
// SES only gets wired up once AWS_REGION, AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY and SES_FROM_EMAIL are all present in the
// environment (see .env.example). Until then, sendVerificationCode() falls
// back to logging the code to the server console so the forgot-password
// flow is still testable end-to-end in local dev without an AWS account —
// remove that fallback (or gate it behind NODE_ENV !== 'production') once
// SES is actually configured for a real deployment.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly client: SESClient | null;
  private readonly fromEmail?: string;

  constructor(private readonly config: ConfigService) {
    this.fromEmail = this.config.get<string>('SES_FROM_EMAIL');
    const region = this.config.get<string>('AWS_REGION');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.client =
      region && accessKeyId && secretAccessKey && this.fromEmail
        ? new SESClient({ region, credentials: { accessKeyId, secretAccessKey } })
        : null;
  }

  async sendVerificationCode(toEmail: string, code: string): Promise<void> {
    if (!this.client || !this.fromEmail) {
      this.logger.warn(
        `AWS SES is not configured (need AWS_REGION, AWS_ACCESS_KEY_ID, ` +
          `AWS_SECRET_ACCESS_KEY and SES_FROM_EMAIL in .env). Dev fallback — ` +
          `password reset code for ${toEmail}: ${code}`,
      );
      return;
    }

    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: 'Your Studio VR verification code', Charset: 'UTF-8' },
        Body: {
          Text: {
            Charset: 'UTF-8',
            Data:
              `Your Studio VR password reset code is ${code}.\n\n` +
              `It expires in 10 minutes. If you didn't request this, you can ` +
              `safely ignore this email.`,
          },
        },
      },
    });

    try {
      await this.client.send(command);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email via SES to ${toEmail}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
