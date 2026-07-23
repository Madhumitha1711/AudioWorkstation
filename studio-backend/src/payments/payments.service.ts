import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PaymentGatewayName } from './gateways/payment-gateway.interface';
import { Payment } from './payment.entity';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly gateways: PaymentGatewayRegistry,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
  ) {}

  // Single lifetime-access price, matching studio-vr's checkoutSlice.PRICE
  // ($199) — kept configurable here rather than hardcoded so it can be
  // changed without a frontend deploy (the frontend still shows its own
  // copy of the price for the order summary, but this is what's actually
  // charged).
  private priceInSmallestUnit(): { amount: number; currency: string } {
    const priceUsd = this.config.get<number>('COURSE_PRICE_USD', 199);
    return { amount: Math.round(priceUsd * 100), currency: 'USD' };
  }

  async createOrder(user: User, returnTo?: string) {
    if (user.hasAccess) {
      throw new ConflictException('Payment already completed for this account.');
    }

    const gateway = this.gateways.getActive();
    const { amount, currency } = this.priceInSmallestUnit();
    const receipt = `user-${user.id}-${Date.now()}`;

    const order = await gateway.createOrder(amount, currency, receipt, returnTo);

    await this.paymentsRepo.save(
      this.paymentsRepo.create({
        userId: user.id,
        gateway: gateway.name,
        gatewayOrderId: order.gatewayOrderId,
        gatewayPaymentId: null,
        amount,
        currency,
        status: 'created',
      }),
    );

    return {
      gateway: gateway.name,
      gatewayOrderId: order.gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
      ...order.clientPayload,
    };
  }

  async verifyPayment(
    user: User,
    payload: { gatewayOrderId: string; gatewayPaymentId?: string; signature?: string },
  ) {
    if (user.hasAccess) {
      return { hasPaid: true };
    }

    const payment = await this.paymentsRepo.findOne({
      where: { gatewayOrderId: payload.gatewayOrderId },
    });
    if (!payment || payment.userId !== user.id) {
      throw new UnauthorizedException('Unknown order for this account.');
    }

    const gateway = this.gateways.get(payment.gateway);
    const result = await gateway.verifyPayment(payload);
    if (!result.verified) {
      throw new UnauthorizedException('Payment verification failed.');
    }

    await this.markPaymentSucceeded(user, payment, result.gatewayPaymentId);
    return { hasPaid: true };
  }

  // Async confirmation path — the gateway calls this directly (not the
  // browser), so there's no signed-in user in scope here at all. Silently
  // ignores anything that doesn't verify or doesn't match a known order,
  // rather than erroring, since a webhook endpoint that talks back
  // invites probing.
  async handleWebhook(
    gatewayName: PaymentGatewayName,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const gateway = this.gateways.get(gatewayName);
    const result = await gateway.verifyWebhook(rawBody, signature);
    if (!result) return;

    const payment = await this.paymentsRepo.findOne({
      where: { gatewayOrderId: result.gatewayOrderId },
    });
    if (!payment) return;

    if (result.status === 'paid') {
      const user = await this.usersService.findById(payment.userId);
      if (user) {
        await this.markPaymentSucceeded(user, payment, result.gatewayPaymentId);
      }
    } else if (payment.status !== 'paid') {
      payment.status = 'failed';
      await this.paymentsRepo.save(payment);
    }
  }

  private async markPaymentSucceeded(
    user: User,
    payment: Payment,
    gatewayPaymentId: string,
  ): Promise<void> {
    if (payment.status !== 'paid') {
      payment.status = 'paid';
      payment.gatewayPaymentId = gatewayPaymentId || payment.gatewayPaymentId;
      await this.paymentsRepo.save(payment);
    }

    if (!user.hasPaid) {
      user.hasPaid = true;
      user.paidAt = new Date();
      await this.usersService.save(user);
    }
  }

  async status(user: User) {
    return { hasPaid: user.hasAccess, paidAt: user.paidAt };
  }
}
