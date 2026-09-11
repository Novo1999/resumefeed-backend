export type MeResponse = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: string | null;
  emailConfirmed: boolean;
  metadata: Record<string, unknown>;
};

export type ProfileFieldErrors = Partial<Record<'fullName' | 'avatarUrl' | 'role', string>>;

export type ParsedProfilePatch = {
  errors: ProfileFieldErrors;
  message?: string;
  updates: Record<string, string | null>;
};
