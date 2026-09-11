import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase';

/**
 * Auth is split between the two apps:
 *   - the frontend runs the login/signup flows with the anon key and holds the session
 *   - this API only ever *verifies* the access token it sends on each request
 *
 * That verification is not optional here: TypeORM connects with the role in
 * DATABASE_URL, which bypasses row level security, so these middlewares are the
 * only thing standing between a request and the data.
 */

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, ...rest] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

type VerifyResult =
  | { ok: true; user: AuthUser }
  | { ok: false; status: number; message: string };

async function verifyToken(token: string): Promise<VerifyResult> {
  try {
    const { data, error } = await getSupabase().auth.getUser(token);

    if (error) {
      // `status` is undefined when the request never reached the auth server,
      // which is our problem to report, not a bad token.
      if (error.status === undefined) {
        return { ok: false, status: 503, message: 'Could not reach the auth service' };
      }
      return { ok: false, status: 401, message: 'Invalid or expired token' };
    }

    if (!data.user) {
      return { ok: false, status: 401, message: 'Invalid or expired token' };
    }

    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, status: 503, message: (err as Error).message };
  }
}

/** Rejects the request unless it carries a valid Supabase access token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const result = await verifyToken(token);

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  req.user = result.user;
  req.accessToken = token;
  next();
}

/**
 * Attaches the user when a valid token is present and carries on regardless.
 * For routes that are public but read differently when signed in — a feed that
 * marks which resumes you already saved, say.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) {
    next();
    return;
  }

  const result = await verifyToken(token);
  if (result.ok) {
    req.user = result.user;
    req.accessToken = token;
  }

  next();
}
