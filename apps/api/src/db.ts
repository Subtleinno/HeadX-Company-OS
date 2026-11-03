import type { Pool } from 'pg';
import type { DbCheck } from './app.js';

export function createDbCheck(pool: Pool): DbCheck {
  return async () => {
    await pool.query('SELECT 1');
  };
}

/**
 * pg 的閒置連線中斷時會在 pool 上發出 error；沒有處理者的話 process 會直接崩潰。
 */
export function attachPoolErrorHandler(
  pool: Pool,
  onError: (error: Error) => void,
): void {
  pool.on('error', onError);
}
