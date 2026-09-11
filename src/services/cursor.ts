import { ServiceError } from './service-error';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keyset position in a `(created_at, id)` ordering, opaque to clients. */
export type Cursor = {
  createdAt: string;
  id: string;
};

export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new ServiceError(`Invalid ${label}.`, 'bad_request');
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function parseCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) return null;
  if (cursor.length > 512) throw new ServiceError('Invalid cursor.', 'bad_request');

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Cursor).createdAt !== 'string' ||
      Number.isNaN(Date.parse((parsed as Cursor).createdAt)) ||
      typeof (parsed as Cursor).id !== 'string' ||
      !UUID_PATTERN.test((parsed as Cursor).id)
    ) {
      throw new Error('Malformed cursor');
    }
    return parsed as Cursor;
  } catch {
    throw new ServiceError('Invalid cursor.', 'bad_request');
  }
}

/**
 * Postgres truncates a JS `Date` to milliseconds, which collides on busy rows.
 * Selecting the raw microsecond timestamp keeps keyset paging exact.
 */
export function microsecondTimestamp(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}
