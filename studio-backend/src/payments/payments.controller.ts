import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { SkipPayment } from '../auth/skip-payment.decorator';
import { User } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { PaymentsService } from './payments.service';

// Every route here is @SkipPayment() (or @Public() for the webhooks) on
// purpose — this is the one corner of the API an unpaid, signed-in student
// still needs to reach in order to *become* paid. See JwtAuthGuard for the
// enforcement that makes every other controller in the app require
// hasPaid by default.
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @SkipPayment()
  @Post('create-order')
  createOrder(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.paymentsService.createOrder(user, dto.returnTo);
  }

  @SkipPayment()
  @Post('verify')
  verify(@CurrentUser() user: User, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(user, dto);
  }

  @SkipPayment()
  @Get('status')
  status(@CurrentUser() user: User) {
    return this.paymentsService.status(user);
  }

  // Webhooks aren't authenticated with a bearer token at all — the gateway
  // calls these directly with its own signature scheme (see
  // RazorpayGateway/StripeGateway.verifyWebhook), so they're @Public().
  // `rawBody` (enabled via `rawBody: true` in main.ts's NestFactory.create)
  // is required here because the signature is computed over the exact
  // bytes the gateway sent, not the JSON-parsed-and-re-serialized body.
  @Public()
  @Post('webhook/razorpay')
  razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleWebhook(
      'razorpay',
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
  }

  @Public()
  @Post('webhook/stripe')
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleWebhook(
      'stripe',
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
  }
}
