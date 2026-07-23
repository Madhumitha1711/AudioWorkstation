import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, PaymentGatewayName } from './payment-gateway.interface';
import { RazorpayGateway } from './razorpay.gateway';
import { StripeGateway } from './stripe.gateway';

// Both gateway integrations are always instantiated (cheap — no network
// calls happen until a method is actually invoked), and PAYMENT_GATEWAY in
// .env picks which one is "active" for new orders. This means switching
// gateways is a one-line env change, never a code change — and a payment
// already in flight on the previous gateway still verifies correctly
// because PaymentsService looks up the gateway a given order actually used
// (see Payment.gateway) rather than always assuming "active".
@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways: Record<PaymentGatewayName, PaymentGateway>;
  readonly activeName: PaymentGatewayName;

  constructor(
    config: ConfigService,
    razorpay: RazorpayGateway,
    stripe: StripeGateway,
  ) {
    this.gateways = { razorpay, stripe };

    const configured = config.get<string>('PAYMENT_GATEWAY', 'razorpay');
    this.activeName =
      configured === 'stripe' || configured === 'razorpay'
        ? configured
        : 'razorpay';
  }

  getActive(): PaymentGateway {
    return this.gateways[this.activeName];
  }

  get(name: PaymentGatewayName): PaymentGateway {
    return this.gateways[name];
  }
}
