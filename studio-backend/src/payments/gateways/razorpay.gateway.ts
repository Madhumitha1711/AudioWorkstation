import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import {
  CreatedOrder,
  PaymentGateway,
  VerifyResult,
  WebhookResult,
} from './payment-gateway.interface';

// One-time-payment integration against Razorpay's Orders API — see
// https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/
// Selected when PAYMENT_GATEWAY=razorpay (see PaymentGatewayRegistry).
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET must be
// set from the Razorpay dashboard (Settings -> API Keys, Settings ->
// Webhooks) for this to actually reach Razorpay — see .env.example.
@Injectable()
export class RazorpayGateway implements PaymentGateway {
  readonly name = 'razorpay' as const;

  private readonly client: Razorpay;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.keyId = this.config.get<string>('RAZORPAY_KEY_ID', '');
    this.keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET', '');
    this.webhookSecret = this.config.get<string>(
      'RAZORPAY_WEBHOOK_SECRET',
      '',
    );
    // The Razorpay SDK's constructor throws immediately if key_id is
    // empty ("`key_id` or `oauthToken` is mandatory") — and this class is
    // always instantiated at boot regardless of which gateway is
    // "active" (see PaymentGatewayRegistry, which wires up both). Fall
    // back to a placeholder so the app still starts in dev without
    // Razorpay configured — any real call then fails against Razorpay's
    // API instead of crashing the whole server on boot, same pattern as
    // StripeGateway/GOOGLE_CLIENT_ID being left blank.
    this.client = new Razorpay({
      key_id: this.keyId || 'rzp_test_placeholder',
      key_secret: this.keySecret || 'placeholder_secret',
    });
  }

  async createOrder(
    amount: number,
    currency: string,
    receipt: string,
  ): Promise<CreatedOrder> {
    // returnTo isn't accepted here — Razorpay Checkout is a modal that
    // opens over the current page, so there's no redirect target needed.
    const order = await this.client.orders.create({
      amount,
      currency,
      receipt,
    });

    return {
      gatewayOrderId: order.id,
      amount,
      currency,
      // Handed straight to the frontend's Razorpay Checkout widget
      // (`new window.Razorpay({...}).open()`). key_id is publishable by
      // design — key_secret never leaves this service.
      clientPayload: {
        keyId: this.keyId,
        orderId: order.id,
        amount,
        currency,
      },
    };
  }

  async verifyPayment(
    payload: Record<string, string | undefined>,
  ): Promise<VerifyResult> {
    const { gatewayOrderId, gatewayPaymentId, signature } = payload;
    if (!gatewayOrderId || !gatewayPaymentId || !signature) {
      return {
        verified: false,
        gatewayOrderId: gatewayOrderId ?? '',
        gatewayPaymentId: gatewayPaymentId ?? '',
      };
    }

    // Razorpay's documented verification: HMAC-SHA256 of "order_id|payment_id"
    // signed with the account's key_secret, compared to what Checkout's
    // success handler returned. Only someone holding key_secret (us, or
    // Razorpay) could have produced a matching signature.
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');

    const verified = safeEqualHex(expected, signature);
    return { verified, gatewayOrderId, gatewayPaymentId };
  }

  async verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookResult | null> {
    if (!signature || !this.webhookSecret) return null;

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (!safeEqualHex(expected, signature)) return null;

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }

    const entity = event?.payload?.payment?.entity;
    if (!entity?.order_id || !entity?.id) return null;

    return {
      gatewayOrderId: entity.order_id,
      gatewayPaymentId: entity.id,
      status: event.event === 'payment.captured' ? 'paid' : 'failed',
    };
  }
}

// Constant-time hex-string comparison — guards against timing attacks on
// the signature check. Falls back to `false` instead of throwing when the
// lengths differ (Buffer.from + timingSafeEqual would throw otherwise).
function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
