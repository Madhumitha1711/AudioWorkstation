import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'user' | 'admin';

// A single account can be created with a password, with Google Sign-In, or
// end up with both (see AuthService.loginWithGoogle, which links a Google
// identity onto an existing password account with the same email instead of
// creating a second row). Duplicate emails are rejected at signup time
// regardless of which method the existing account used to register.
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  email: string;

  // Null for accounts that only ever signed up with Google and never set a
  // local username.
  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  // Null for accounts created via Google Sign-In that have never set a
  // local password.
  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  // Google's stable per-account subject id, set once this account signs in
  // with Google (either at signup or by linking later).
  @Column({ type: 'varchar', nullable: true })
  googleId: string | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  // --- Forgot-password flow: a six-digit code, stored hashed (like a
  // password) so a database leak doesn't hand out live reset codes, plus an
  // expiry so a stale code can't be replayed. Both are cleared once used. ---
  @Column({ type: 'varchar', nullable: true })
  resetCodeHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resetCodeExpiresAt: Date | null;

  // --- Payment gate: every authenticated route other than the handful
  // marked @SkipPayment() requires hasAccess to be true (see
  // JwtAuthGuard). hasPaid is set once by PaymentsService after a gateway
  // (Razorpay/Stripe) confirms the one-time lifetime-access purchase —
  // never trust a client-supplied flag for this. ---
  @Column({ default: false })
  hasPaid: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  // Only ever set to 'admin' by AuthService.syncAdminRole(), which promotes
  // an account the first time it authenticates with an email listed in
  // ADMIN_EMAILS (studio-backend/.env) — see that method for why this is
  // promote-only (removing an email from the list doesn't auto-demote an
  // account that already has it).
  @Column({ default: 'user' })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Single source of truth for "does this account get past the payment
  // gate" — a real purchase (hasPaid) or an admin account (role==='admin')
  // both count. JwtAuthGuard, PaymentsService, and AuthService.toPublicUser
  // all read this instead of `hasPaid` directly, so admin bypass logic
  // lives in exactly one place rather than being duplicated (and
  // potentially missed) at each call site.
  get hasAccess(): boolean {
    return this.hasPaid || this.role === 'admin';
  }
}
