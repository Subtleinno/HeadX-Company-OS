import type { Pool } from 'pg';

/**
 * 品牌引導：stage 級核准狀態（可寫入、可追溯的持久事實）。
 *
 * 跟 engine 的 buildBrief() 不同：engine 把 approval.state 硬編碼成 draft（4E 等
 * stage 寫死 {state:"draft",approved_by:null}），4A 的核准機制則只活在 browser
 * localStorage。這張表把「核准」變成真正可寫入的資料，令匯出的 design.md /
 * token 檔講得出「這段是草稿還是已核准、誰核准、哪個版本」。
 *
 * 粒度是 stage 級（4A 的每卡獨立 status 留待日後加 card 級）。
 * scope 跟 brand_guide_state 一樣三層（品牌層／品牌集／公司層）。
 */

export type ApprovalStatus = 'draft' | 'in_review' | 'approved' | 'needs_revision';

export type GuideApproval = {
  stage: string;
  status: ApprovalStatus;
  /** 核准者顯示名；未核准或 agent 寫的留空。 */
  approverName: string | null;
  version: string;
  note: string;
  rationale: string;
  updatedAt: string | null;
};

type ApprovalRow = {
  stage: string;
  status: string;
  approver_name: string | null;
  version: string;
  note: string;
  rationale: string;
  updated_at: Date;
};

const KNOWN_STATUS: readonly string[] = ['draft', 'in_review', 'approved', 'needs_revision'];

function toApproval(row: ApprovalRow): GuideApproval {
  return {
    stage: row.stage,
    status: row.status as ApprovalStatus,
    approverName: row.approver_name,
    version: row.version,
    note: row.note,
    rationale: row.rationale,
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * 讀一個品牌在某 stage 的核准狀態。沒有紀錄就回 null（未核准過，等於 draft）。
 */
export async function getApproval(
  pool: Pool,
  brandId: string | null,
  stage: string,
  brandSetId: string | null = null,
): Promise<GuideApproval | null> {
  const result = await pool.query<ApprovalRow>(
    `select a.stage, a.status, a.version, a.note, a.rationale, a.updated_at,
            u.display_name as approver_name
       from brand_guide_approval a
       left join app_user u on u.id = a.approver_id
      where a.brand_id is not distinct from $1 and a.stage = $2
        and a.brand_set_id is not distinct from $3`,
    [brandId, stage, brandSetId],
  );

  const row = result.rows[0];

  return row === undefined ? null : toApproval(row);
}

/**
 * 寫核准狀態（upsert，每 scope 每 stage 一份）。
 *
 * 三條 partial index 對應三個 scope（同 brand_guide_state 一致），upsert 的
 * on conflict 一定要講中同一條。
 */
export async function saveApproval(
  pool: Pool,
  input: {
    /** null ＝ 公司層（04F 行銷內容）。 */
    brandId: string | null;
    stage: string;
    status: ApprovalStatus;
    /** 核准者（app_user）；只有 approved 時必須有。 */
    approverId: string | null;
    version: string;
    note: string;
    rationale: string;
    /** 有值＝寫進某個品牌集；null／undefined＝品牌層。 */
    brandSetId?: string | null;
  },
): Promise<GuideApproval> {
  if (!KNOWN_STATUS.includes(input.status)) {
    throw new Error(`未知核准狀態：${input.status}`);
  }

  if (input.status === 'approved' && input.approverId === null) {
    throw new Error('核准狀態 approved 必須有核准者');
  }

  const brandSetId = input.brandSetId ?? null;

  if (input.brandId === null) {
    await pool.query(
      `insert into brand_guide_approval
         (brand_id, stage, status, approver_id, version, note, rationale, updated_at)
       values (null, $1, $2, $3, $4, $5, $6, now())
       on conflict (stage) where brand_id is null
       do update set status = excluded.status, approver_id = excluded.approver_id,
                     version = excluded.version, note = excluded.note,
                     rationale = excluded.rationale, updated_at = now()`,
      [input.stage, input.status, input.approverId, input.version, input.note, input.rationale],
    );
  } else if (brandSetId === null) {
    await pool.query(
      `insert into brand_guide_approval
         (brand_id, stage, status, approver_id, version, note, rationale, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (brand_id, stage) where brand_set_id is null
       do update set status = excluded.status, approver_id = excluded.approver_id,
                     version = excluded.version, note = excluded.note,
                     rationale = excluded.rationale, updated_at = now()`,
      [input.brandId, input.stage, input.status, input.approverId, input.version, input.note, input.rationale],
    );
  } else {
    await pool.query(
      `insert into brand_guide_approval
         (brand_id, brand_set_id, stage, status, approver_id, version, note, rationale, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (brand_set_id, stage) where brand_set_id is not null
       do update set status = excluded.status, approver_id = excluded.approver_id,
                     version = excluded.version, note = excluded.note,
                     rationale = excluded.rationale, updated_at = now()`,
      [
        input.brandId,
        brandSetId,
        input.stage,
        input.status,
        input.approverId,
        input.version,
        input.note,
        input.rationale,
      ],
    );
  }

  const saved = await getApproval(pool, input.brandId, input.stage, brandSetId);

  // 剛寫入，一定有紀錄；防禦性回退。
  return (
    saved ?? {
      stage: input.stage,
      status: input.status,
      approverName: null,
      version: input.version,
      note: input.note,
      rationale: input.rationale,
      updatedAt: new Date().toISOString(),
    }
  );
}
