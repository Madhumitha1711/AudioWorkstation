import request from "./client";

// Every call here requires the bearer token (studio-backend's PaymentsController
// routes are all @SkipPayment() — reachable while signed in but unpaid — but
// they're still behind JwtAuthGuard's authentication check, not @Public()).

// Kicks off a checkout attempt. `returnTo` is only used by a redirect-based
// gateway (Stripe Checkout) to know where to send the student after they
// come back from Stripe's hosted page — see PaymentCompletePage.
export function createOrder(token, returnTo) {
  return request("/payments/create-order", {
    method: "POST",
    token,
    body: { returnTo },
  });
}

// `payload` shape depends on which gateway is active — see
// VerifyPaymentDto on the backend: always `gatewayOrderId`, plus
// `gatewayPaymentId`/`signature` for Razorpay's Checkout success handler.
export function verifyPayment(token, payload) {
  return request("/payments/verify", { method: "POST", token, body: payload });
}

export function getPaymentStatus(token) {
  return request("/payments/status", { token });
}
