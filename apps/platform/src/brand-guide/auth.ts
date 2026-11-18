import type { Pool } from 'pg';

/**
 * 品牌引導的共用授權與存在檢查。
 *
 * 從舊 brand-pages 系統搬過來，令 brand-guide 不再依賴舊 module。
 * 一句話：**老闆永遠可以改；其他人要有一行 `brand_editor`。**
 */
export type Actor = { id: string; role: string };

export async function canEditBrand(db: Pool, brandId: string, actor: Actor): Promise<boolean> {
  if (actor.role === 'owner') {
    return true;
  }

  const result = await db.query(
    'select 1 from brand_editor where brand_id = $1 and user_id = $2',
    [brandId, actor.id],
  );

  return result.rowCount !== null && result.rowCount > 0;
}

export async function brandExists(db: Pool, brandId: string): Promise<boolean> {
  const result = await db.query('select 1 from brand where id = $1', [brandId]);
  return result.rowCount !== null && result.rowCount > 0;
}
