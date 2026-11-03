import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { attachPoolErrorHandler } from '../src/db';

describe('attachPoolErrorHandler', () => {
  // 這個測試在忘記掛 error 處理者時會因為未處理的 'error' 事件而失敗。
  it('閒置連線出錯時有處理者，不會令 process 崩潰', async () => {
    const pool = new Pool();
    const messages: string[] = [];
    attachPoolErrorHandler(pool, (error) => {
      messages.push(error.message);
    });

    expect(() => pool.emit('error', new Error('connection terminated'))).not.toThrow();
    expect(messages).toEqual(['connection terminated']);

    await pool.end();
  });
});
