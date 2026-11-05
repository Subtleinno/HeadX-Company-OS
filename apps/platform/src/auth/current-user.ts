import type { FastifyRequest } from 'fastify';
import type { TrustedEntry } from '@company-os/contracts';
import type { Pool } from 'pg';
import { readSessionToken } from './session-cookie.js';
import { findSessionUser, type UserRow } from './store.js';
import { hashSessionToken } from './token.js';

/**
 * 由 cookie 找目前登入的人。
 * 沒有 cookie、session 過期、已撤銷、使用者已停用、入口不相符，一律回 null。
 *
 * `entry` 一定要由呼叫者餵「已驗證」的那一個（issue #87）：session 記住了
 * 它是經由哪個入口發出的，這裡只接受同一個入口。無入口的請求連查都不應該查。
 */
export async function getSignedInUser(
  pool: Pool,
  request: FastifyRequest,
  now: Date,
  entry: TrustedEntry,
): Promise<UserRow | null> {
  const token = readSessionToken(request.headers.cookie);

  if (token === null) {
    return null;
  }

  return findSessionUser(pool, hashSessionToken(token), now, entry);
}
