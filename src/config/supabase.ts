import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client (service role key — keep on the server only).
 *
 * Created on first use so the API still boots before `.env` is filled in,
 * the same way the database connection in `index.ts` degrades instead of crashing.
 */
export function getSupabase(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env ' +
        '(Supabase Dashboard → Project Settings → API).',
    );
  }

  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return client;
}
