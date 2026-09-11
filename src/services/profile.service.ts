import type { AuthUser } from '@supabase/supabase-js';
import { env } from '../config/env';
import { getSupabase } from '../config/supabase';
import type { MeResponse, ParsedProfilePatch, ProfileFieldErrors } from '../types/profile';
import type { PublicProfile } from '../types/resume';

const NAME_MIN = 2;
const NAME_MAX = 80;
const ROLE_MAX = 100;

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function serializeProfile(user: AuthUser): MeResponse {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: readString(metadata, 'full_name'),
    avatarUrl: readString(metadata, 'avatar_url'),
    role: readString(metadata, 'role'),
    emailConfirmed: Boolean(user.email_confirmed_at),
    metadata,
  };
}

function isOwnAvatarUrl(url: string, userId: string): boolean {
  const prefix = `${env.supabaseUrl}/storage/v1/object/public/${env.supabaseAvatarBucket}/${userId}/`;
  return url.startsWith(prefix);
}

export function parseProfilePatch(body: unknown, userId: string): ParsedProfilePatch {
  const errors: ProfileFieldErrors = {};
  const updates: Record<string, string | null> = {};

  if (typeof body !== 'object' || body === null) {
    return { errors, message: 'Expected a JSON object.', updates };
  }

  const input = body as Record<string, unknown>;
  if ('email' in input) return { errors, message: 'Email cannot be changed here.', updates };

  if ('fullName' in input) {
    const value = input.fullName;
    if (typeof value !== 'string') errors.fullName = 'Name must be text.';
    else {
      const trimmed = value.trim();
      if (trimmed.length < NAME_MIN) errors.fullName = 'That name looks too short.';
      else if (trimmed.length > NAME_MAX) errors.fullName = 'That name is too long.';
      else updates.full_name = trimmed;
    }
  }

  if ('avatarUrl' in input) {
    const value = input.avatarUrl;
    if (value === null) updates.avatar_url = null;
    else if (typeof value !== 'string') errors.avatarUrl = 'Avatar URL must be text or null.';
    else if (!isOwnAvatarUrl(value, userId))
      errors.avatarUrl = 'That avatar is not in your storage folder.';
    else updates.avatar_url = value;
  }

  if ('role' in input) {
    const value = input.role;
    if (value === null) updates.role = null;
    else if (typeof value !== 'string') errors.role = 'Role must be text or null.';
    else {
      const trimmed = value.trim();
      if (trimmed.length > ROLE_MAX) errors.role = 'Role must be 100 characters or fewer.';
      else updates.role = trimmed || null;
    }
  }

  return { errors, updates };
}

/** Merges the patch so unrelated Auth metadata cannot be accidentally erased. */
export async function updateProfile(
  user: AuthUser,
  updates: Record<string, string | null>,
): Promise<AuthUser> {
  const { data, error } = await getSupabase().auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), ...updates },
  });
  if (error || !data.user) throw new Error(error?.message ?? 'Could not update your profile.');
  return data.user;
}

export function unknownProfile(id: string): PublicProfile {
  return { id, fullName: null, avatarUrl: null, role: null };
}

/** Returns the limited set of profile details that is safe to show to another member. */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await getSupabase().auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const metadata = data.user.user_metadata ?? {};
  return {
    id: data.user.id,
    fullName: readString(metadata, 'full_name'),
    avatarUrl: readString(metadata, 'avatar_url'),
    role: readString(metadata, 'role'),
  };
}

/**
 * Hydrates the profile shown beside a post, a comment, or a reaction. Supabase
 * Auth is the source of truth for profiles, so this fans out one call per
 * distinct user rather than joining a table that does not exist.
 */
export async function loadPublicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const profiles = await Promise.all(
    [...new Set(userIds)].map(async (id): Promise<PublicProfile> => {
      const { data, error } = await getSupabase().auth.admin.getUserById(id);
      if (error || !data.user) return unknownProfile(id);
      const metadata = data.user.user_metadata ?? {};
      return {
        id,
        fullName: readString(metadata, 'full_name'),
        avatarUrl: readString(metadata, 'avatar_url'),
        role: readString(metadata, 'role'),
      };
    }),
  );
  return new Map(profiles.map((profile) => [profile.id, profile]));
}
