import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
