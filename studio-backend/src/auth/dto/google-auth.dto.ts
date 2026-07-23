import { IsString } from 'class-validator';

export class GoogleAuthDto {
  // The Google ID token (a JWT) returned to the frontend by Google Identity
  // Services after the user picks an account — verified server-side against
  // GOOGLE_CLIENT_ID in AuthService.loginWithGoogle, never trusted as-is.
  @IsString()
  idToken: string;
}
