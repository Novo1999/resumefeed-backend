import morgan from 'morgan';
import type { Request } from 'express';
import { env } from '../config/env';

/**
 * HTTP request logging.
 *
 * Two formats, because the two readers are different: a person watching
 * `npm run dev` wants one short line per request, whereas whatever collects
 * logs in production wants the full Apache combined line. Set LOG_FORMAT to
 * override either with a morgan format name (dev, tiny, short...) or a string.
 */

/** Who made the request, once `requireAuth`/`optionalAuth` has verified them. */
morgan.token('user', (req: Request) => req.user?.id ?? 'anon');

const devFormat = ':method :url :status :response-time ms - :user';

/** Apache combined, plus the user id — the field you actually search prod logs by. */
const prodFormat =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :user';

/** Uptime probes hit `/health` constantly; they drown out anything useful. */
function skipHealthChecks(req: Request) {
  return req.url === '/health';
}

export const httpLogger = morgan(env.logFormat ?? (env.isProduction ? prodFormat : devFormat), {
  skip: env.isProduction ? skipHealthChecks : () => false,
});
