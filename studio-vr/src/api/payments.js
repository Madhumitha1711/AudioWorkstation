import request from "./client";

export function createOrder(token, returnTo) {
  return request("/payments/create-order", {
    method: "POST",
    token,
    body: { returnTo },
  });
}
export function verifyPayment(token, payload) {
  return request("/payments/verify", { method: "POST", token, body: payload });
}

export function getPaymentStatus(token) {
  return request("/payments/status", { token });
}
