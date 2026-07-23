export type PaymentGatewayName = 'razorpay' | 'stripe';
export type PaymentStatus = 'created' | 'paid' | 'failed';

export interface CreatedOrder {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  // Gateway-specific extra fields the frontend checkout step needs —
  // passed straight through to the browser by PaymentsController, never
  // interpreted by PaymentsService. Razorpay: { keyId, orderId, amount,
  // currency } for the Checkout widget. Stripe: { checkoutUrl } to redirect
  // the browser to Stripe's hosted Checkout page.
  clientPayload: Record<string, unknown>;
}

export interface VerifyResult {
  verified: boolean;
  gatewayOrderId: string;
  gatewayPaymentId: string;
}

export interface WebhookResult {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  status: PaymentStatus;
}

// Common shape both gateway integrations implement so PaymentsService/
// PaymentsController never need to branch on which gateway is active —
// see PaymentGatewayRegistry for how PAYMENT_GATEWAY selects between them.
export interface PaymentGateway {
  readonly name: PaymentGatewayName;

  // Creates a fresh order/session for a one-time payment of `amount`
  // (smallest currency unit, e.g. cents) in `currency`. `returnTo` is the
  // frontend route to land on after payment; only meaningful for
  // redirect-based flows (Stripe Checkout) — Razorpay's modal ignores it
  // since the browser never navigates away.
  createOrder(
    amount: number,
    currency: string,
    receipt: string,
    returnTo?: string,
  ): Promise<CreatedOrder>;

  // Verifies a payment the frontend claims just succeeded, from whatever
  // fields that gateway's checkout flow hands back (see
  // payments/dto/verify-payment.dto.ts). Must independently confirm this
  // with the gateway (signature check or a server-to-server lookup) rather
  // than trusting the client's word for it.
  verifyPayment(payload: Record<string, string | undefined>): Promise<VerifyResult>;

  // Verifies and parses an async webhook call from the gateway itself.
  // Returns null for a request that fails signature verification (the
  // caller should ignore it, not error loudly — could be a forged call).
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookResult | null>;
}
