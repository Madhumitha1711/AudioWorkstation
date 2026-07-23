import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CreatedOrder,
  PaymentGateway,
  VerifyResult,
  WebhookResult,
} from './payment-gateway.interface';

// One-time-payment integration against Stripe Checkout (a Stripe-hosted
// payment page), not Stripe Elements — this backend only ever needs a
// secret key, so the frontend needs no Stripe.js/publishable key at all:
// it just redirects the browser to the `checkoutUrl` this returns, and
// Stripe sends the customer back to FRONTEND_URL/payment/complete
// afterwards (see PaymentPage.jsx / PaymentCompletePage.jsx).
// Selected when PAYMENT_GATEWAY=stripe (see PaymentGatewayRegistry).
// STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / FRONTEND_URL must be set —
// see .env.example.
@Injectable()
export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe' as const;

  private readonly client: Stripe;
  private readonly webhookSecret: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    // Placeholder key when unset so the app still boots in dev without
    // Stripe configured — any real call will fail against Stripe's API,
    // same pattern as GOOGLE_CLIENT_ID being left blank.
    this.client = new Stripe(secretKey || 'sk_test_placeholder');
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    this.frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
  }

  async createOrder(
    amount: number,
    currency: string,
    receipt: string,
    returnTo?: string,
  ): Promise<CreatedOrder> {
    const successPath = `/payment/complete?session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(
      returnTo || '/studio',
    )}`;

    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amount,
            product_data: { name: 'Studio VR — full course access' },
          },
          quantity: 1,
        },
      ],
      client_reference_id: receipt,
      success_url: `${this.frontendUrl}${successPath}`,
      cancel_url: `${this.frontendUrl}/payment`,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout Session URL');
    }

    return {
      gatewayOrderId: session.id,
      amount,
      currency,
      clientPayload: { checkoutUrl: session.url },
    };
  }

  async verifyPayment(
    payload: Record<string, string | undefined>,
  ): Promise<VerifyResult> {
    const gatewayOrderId = payload.gatewayOrderId;
    if (!gatewayOrderId) {
      return { verified: false, gatewayOrderId: '', gatewayPaymentId: '' };
    }

    // No client-supplied signature to check here — instead we ask Stripe
    // directly (server-to-server, using our secret key) whether this
    // session actually completed. That's at least as strong as verifying a
    // signature, since the client has no way to influence Stripe's answer.
    const session = await this.client.checkout.sessions.retrieve(gatewayOrderId);
    const verified = session.payment_status === 'paid';
    const gatewayPaymentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? '');

    return { verified, gatewayOrderId, gatewayPaymentId };
  }

  async verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookResult | null> {
    if (!signature || !this.webhookSecret) return null;

    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      return null;
    }

    if (event.type !== 'checkout.session.completed') return null;

    const session = event.data.object as Stripe.Checkout.Session;
    const gatewayPaymentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? '');

    return {
      gatewayOrderId: session.id,
      gatewayPaymentId,
      status: session.payment_status === 'paid' ? 'paid' : 'failed',
    };
  }
}
