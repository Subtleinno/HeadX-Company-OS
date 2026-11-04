import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { readSessionToken } from './session-cookie.js';
import { findSessionUser, type UserRow } from './store.js';
import { hashSessionToken } from './token.js';

/**
 * 由 cookie 找目前登入的人。
 * 沒有 cookie、session 過期、已撤銷、使用者已停用，一律回 null。
 */
export async function getSignedInUser(
  pool: Pool,
  request: FastifyRequest,
  now: Date,
): Promise<UserRow | null> {
  const token = readSessionToken(request.headers.cookie);

  if (token === null) {
    return null;
  }

  return findSessionUser(pool, hashSessionToken(token), now);
}
