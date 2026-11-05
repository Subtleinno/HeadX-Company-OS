import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';

/**
 * 根單位的第一次填入（issue #81，與 #80 的種子同一個機制）。
 *
 * 全公司只有一個根；它代表「整間公司」這個單位，所以名稱與類型不由用家決定。
 * 只在一張表完全沒有列時才建立 —— 包括已刪除的列：把單位刪光是用家的決定，
 * 重啟不應該讓它長回來。
 *
 * 根單位不寫任何上級邊：它是圖的頂點，有上級就不是根了。
 */

export const ROOT_UNIT_NAME = '公司';
export const ROOT_UNIT_TYPE = 'company';

export type OrgSeedResult = {
  seededRoot: boolean;
  rootId: string | null;
};

export async function seedOrgUnits(input: {
  pool: Pool;
  log?: (message: string) => void;
}): Promise<OrgSeedResult> {
  const log = input.log ?? ((): void => undefined);
  const client = await input.pool.connect();

  try {
    await client.query('begin');

    const existing = await client.query<{ count: number }>(
      'select count(*)::int as count from org_unit',
    );

    if ((existing.rows[0]?.count ?? 0) > 0) {
      await client.query('commit');
      return { seededRoot: false, rootId: null };
    }

    const inserted = await client.query<{ id: string }>(
      `insert into org_unit (name, type, is_root) values ($1, $2, true) returning id`,
      [ROOT_UNIT_NAME, ROOT_UNIT_TYPE],
    );

    const rootId = inserted.rows[0]?.id;

    if (rootId === undefined) {
      throw new Error('建立根單位之後沒有回傳 id');
    }

    await writeAudit(client, {
      actorType: 'system',
      actorId: 'org-seed',
      action: 'org_unit.seed',
      target: rootId,
      detail: { name: ROOT_UNIT_NAME, type: ROOT_UNIT_TYPE },
    });

    await client.query('commit');
    log('已建立根單位「公司」');

    return { seededRoot: true, rootId };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
