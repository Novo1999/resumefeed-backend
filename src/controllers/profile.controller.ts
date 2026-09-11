import type { Request, Response } from 'express';
import { getPublicProfile } from '../services/profile.service';

export async function getProfile(req: Request, res: Response) {
  const profile = await getPublicProfile(req.params.userId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found.' });
    return;
  }
  res.json(profile);
}
