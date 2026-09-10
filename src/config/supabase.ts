import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Server-side Supabase client (service role key — keep on the server only).
 * Ready to use for auth/storage when you build those features.
 */
export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
