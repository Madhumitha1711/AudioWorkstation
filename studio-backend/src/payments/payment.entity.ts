import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import type {
  PaymentGatewayName,
  PaymentStatus,
} from './gateways/payment-gateway.interface';

// One row per checkout attempt (not just successful ones), so a failed or
// abandoned payment is still auditable. `gatewayOrderId` is assigned up
// front by PaymentsService.createOrder(); `gatewayPaymentId` is filled in
// once the gateway confirms the charge — via POST /payments/verify (the
// browser calling back after checkout) or the gateway's webhook,
// whichever arrives first (see PaymentsService.markPaymentSucceeded).
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: number;

  @Column()
  gateway: PaymentGatewayName;

  @Index({ unique: true })
  @Column()
  gatewayOrderId: string;

  @Column({ type: 'varchar', nullable: true })
  gatewayPaymentId: string | null;

  // Smallest currency unit (cents/paise), matching what the gateway APIs
  // themselves expect and return.
  @Column({ type: 'int' })
  amount: number;

  @Column()
  currency: string;

  @Column({ default: 'created' })
  status: PaymentStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
