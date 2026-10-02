function smoothExp(prev, target, dt, tau) {
  if (dt <= 0) return prev;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

export const levelBallistic = (prev, target, dt, attack = 0.015, release = 0.35) =>
  smoothExp(prev, target, dt, target > prev ? attack : release);

export const grReadoutSmooth = (prev, target, dt, tau = 0.03) => smoothExp(prev, target, dt, tau);
