import { IsOptional, IsString } from 'class-validator';

// `returnTo` is the frontend route the student was trying to reach before
// getting bounced to /payment (see RequireAuth.jsx's location.state.from).
// Only meaningful for a redirect-based gateway (Stripe Checkout) — it
// becomes part of the success_url so PaymentCompletePage knows where to
// send the student afterwards. Razorpay's modal flow ignores it, since the
// browser never leaves the page.
export class CreateOrderDto {
  @IsOptional()
  @IsString()
  returnTo?: string;
}
