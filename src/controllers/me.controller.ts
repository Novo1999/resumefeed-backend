import type { Request, Response } from 'express';
import { parseProfilePatch, serializeProfile, updateProfile } from '../services/profile.service';

export function getMe(req: Request, res: Response) {
  res.json(serializeProfile(req.user!));
}

export async function patchMe(req: Request, res: Response) {
  const user = req.user!;
  const { errors, message, updates } = parseProfilePatch(req.body, user.id);

  if (message) {
    res.status(400).json({ error: message });
    return;
  }
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Some fields need fixing.', fieldErrors: errors });
    return;
  }
  if (Object.keys(updates).length === 0) {
    res.json(serializeProfile(user));
    return;
  }

  try {
    res.json(serializeProfile(await updateProfile(user, updates)));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
