import type { Pool } from 'pg';

/**
 * 品牌級編輯權（issue #32，決策 C103）。
 *
 * 一句話：**老闆永遠可以改；其他人要有一行 `brand_editor`。**
 *
 * 為咩不寫「role === owner || role === designer」：role 講不到範圍。一個設計師
 * 今日做 A 品牌、明日做 B 品牌，職位不變、部門不變，變的只是「我被指派了哪幾個
 * 品牌」。所以權限掛在 (brand, user) 這一對，而不是掛在人身上。
 *
 * 這一支放在頁與版本的寫入路徑前面。前端也會用 `canEdit` 決定顯示什麼，但
 * **前端不決定可不可以做** —— 後端每次都再問一次，這是 C103 與 #32 第 13 點。
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
