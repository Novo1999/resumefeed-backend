import type { Response } from 'express';
import { SERVICE_ERROR_STATUS, ServiceError } from '../services/service-error';

/** The one place a service failure becomes an HTTP status. */
export function sendServiceError(error: unknown, res: Response) {
  if (error instanceof ServiceError) {
    res
      .status(SERVICE_ERROR_STATUS[error.kind])
      .json({ error: error.message, fieldErrors: error.fieldErrors });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
