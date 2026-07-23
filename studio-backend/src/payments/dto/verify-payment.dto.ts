import { IsOptional, IsString } from 'class-validator';

// Loosely typed on purpose: Razorpay's Checkout success handler returns
// razorpay_order_id/razorpay_payment_id/razorpay_signature, while Stripe's
// Checkout return leg only has the session id from the `session_id` query
// param. PaymentsService looks up the Payment row by gatewayOrderId to find
// out which gateway actually issued it, then hands the whole payload to
// that gateway's verifyPayment() to pull out whatever fields it needs.
export class VerifyPaymentDto {
  @IsString()
  gatewayOrderId: string;

  @IsOptional()
  @IsString()
  gatewayPaymentId?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}
