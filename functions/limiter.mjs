// Persistent fixed-window rate limiter with compare-and-set writes.
// Retries only when a predicate mismatch proves the write did not take effect;
// an unknown write outcome fails closed instead of replaying.
import { AppError, rows } from './http.mjs';

export const LIMITS = {
  login: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  register: { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  booking: { maxAttempts: 12, windowMs: 60 * 60 * 1000 },
  comment: { maxAttempts: 10, windowMs: 60 * 60 * 1000 },
  order: { maxAttempts: 6, windowMs: 60 * 60 * 1000 },
  assistant: { maxAttempts: 40, windowMs: 60 * 60 * 1000 },
};

const MAX_CAS_ATTEMPTS = 24;

const bucketKey = (scope, subject) => `${scope}:${subject}`;
const iso = (ms) => new Date(ms).toISOString();

async function readBucket(db, key) {
  return rows(await db.from('auth_limiter')
    .select('key,window_started_at,attempt_count').eq('key', key).limit(1));
}

export async function consume(db, scope, subject, now = Date.now()) {
  const limit = LIMITS[scope];
  if (!limit) throw new AppError('limiter_unavailable', 503);
  const key = bucketKey(scope, subject);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const found = await readBucket(db, key);

    if (found.length === 0) {
      const inserted = rows(await db.from('auth_limiter').insertIfAbsent({
        key, window_started_at: iso(now), attempt_count: 1,
      }, { onConflict: 'key' }).select('key'));
      if (inserted.length === 1) return { allowed: true, remaining: limit.maxAttempts - 1 };
      continue;
    }

    const row = found[0];
    const startedAt = Date.parse(row.window_started_at);
    const count = row.attempt_count;
    if (typeof row.window_started_at !== 'string' || !Number.isSafeInteger(count) || count < 0) {
      throw new AppError('limiter_unavailable', 503);
    }

    if (!Number.isFinite(startedAt) || now - startedAt >= limit.windowMs) {
      const reset = rows(await db.from('auth_limiter')
        .update({ window_started_at: iso(now), attempt_count: 1 })
        .eq('key', key).eq('window_started_at', row.window_started_at).select('key'));
      if (reset.length === 1) return { allowed: true, remaining: limit.maxAttempts - 1 };
      continue;
    }

    if (count >= limit.maxAttempts) {
      return { allowed: false, retryAfterMs: Math.max(0, startedAt + limit.windowMs - now) };
    }

    const incremented = rows(await db.from('auth_limiter')
      .update({ attempt_count: count + 1 })
      .eq('key', key).eq('window_started_at', row.window_started_at).eq('attempt_count', count)
      .select('key'));
    if (incremented.length === 1) return { allowed: true, remaining: limit.maxAttempts - (count + 1) };
  }

  throw new AppError('limiter_busy', 503);
}