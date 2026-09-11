import { Router } from 'express';
import type { AuthUser } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { env } from '../config/env';

const NAME_MIN = 2;
const NAME_MAX = 80;

export type MeResponse = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  emailConfirmed: boolean;
  metadata: Record<string, unknown>;
};

type FieldErrors = Partial<Record<'fullName' | 'avatarUrl', string>>;

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function serialize(user: AuthUser): MeResponse {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: readString(metadata, 'full_name'),
    avatarUrl: readString(metadata, 'avatar_url'),
    emailConfirmed: Boolean(user.email_confirmed_at),
    metadata,
  };
}

/**
 * An avatar URL is only accepted if it points at the caller's own folder in our
 * own public bucket. Without this the field is an open redirect target — anyone
 * could set their picture to a URL they control and log the IP of every viewer
 * of the feed. Widen this if a social login ever supplies its own avatar URL.
 */
function isOwnAvatarUrl(url: string, userId: string) {
  const prefix = `${env.supabaseUrl}/storage/v1/object/public/${env.supabaseAvatarBucket}/${userId}/`;
  return url.startsWith(prefix);
}

type ParsedPatch = {
  errors: FieldErrors;
  message?: string;
  updates: Record<string, string | null>;
};

function parsePatch(body: unknown, userId: string): ParsedPatch {
  const errors: FieldErrors = {};
  const updates: Record<string, string | null> = {};

  if (typeof body !== 'object' || body === null) {
    return { errors, message: 'Expected a JSON object.', updates };
  }

  const input = body as Record<string, unknown>;

  // Changing an email means re-confirming it and re-issuing the session. Out of
  // scope for a profile edit, so the field is rejected rather than ignored.
  if ('email' in input) {
    return { errors, message: 'Email cannot be changed here.', updates };
  }

  if ('fullName' in input) {
    const value = input.fullName;
    if (typeof value !== 'string') {
      errors.fullName = 'Name must be text.';
    } else {
      const trimmed = value.trim();
      if (trimmed.length < NAME_MIN) {
        errors.fullName = 'That name looks too short.';
      } else if (trimmed.length > NAME_MAX) {
        errors.fullName = 'That name is too long.';
      } else {
        updates.full_name = trimmed;
      }
    }
  }

  // `null` clears the picture; a string sets it.
  if ('avatarUrl' in input) {
    const value = input.avatarUrl;
    if (value === null) {
      updates.avatar_url = null;
    } else if (typeof value !== 'string') {
      errors.avatarUrl = 'Avatar URL must be text or null.';
    } else if (!isOwnAvatarUrl(value, userId)) {
      errors.avatarUrl = 'That avatar is not in your storage folder.';
    } else {
      updates.avatar_url = value;
    }
  }

  return { errors, updates };
}

export const meRouter = Router();

/**
 * Who the caller is, according to their access token. Also the cheapest proof
 * that the whole chain works: cookie → browser client → bearer header → verify.
 */
meRouter.get('/', requireAuth, (req, res) => {
  res.json(serialize(req.user!));
});

meRouter.patch('/', requireAuth, async (req, res) => {
  const user = req.user!;
  const { errors, message, updates } = parsePatch(req.body, user.id);

  if (message) {
    res.status(400).json({ error: message });
    return;
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Some fields need fixing.', fieldErrors: errors });
    return;
  }

  if (Object.keys(updates).length === 0) {
    res.json(serialize(user));
    return;
  }

  try {
    // Merged here rather than relying on the auth server's merge semantics, so
    // sending one field can never wipe the others.
    const { data, error } = await getSupabase().auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), ...updates },
    });

    if (error || !data.user) {
      res.status(502).json({ error: error?.message ?? 'Could not update your profile.' });
      return;
    }

    res.json(serialize(data.user));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
