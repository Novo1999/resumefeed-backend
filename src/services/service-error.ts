/** Kinds a service can fail with, mapped to HTTP status codes by the controllers. */
export type ServiceErrorKind =
  | 'bad_request'
  | 'conflict'
  | 'forbidden'
  | 'not_found'
  | 'database_unavailable'
  | 'dependency';

export const SERVICE_ERROR_STATUS: Record<ServiceErrorKind, number> = {
  bad_request: 400,
  conflict: 409,
  forbidden: 403,
  not_found: 404,
  database_unavailable: 503,
  dependency: 502,
};

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly kind: ServiceErrorKind,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
