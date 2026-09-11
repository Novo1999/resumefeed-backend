import type { AuthUser } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` / `optionalAuth` once a bearer token is verified. */
      user?: AuthUser;
      /** The raw access token the user was verified from. */
      accessToken?: string;
    }
  }
}

export {};
