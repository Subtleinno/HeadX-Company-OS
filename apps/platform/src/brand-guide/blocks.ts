import type { Pool, PoolClient } from 'pg';

/**
 * 品牌引導「填寫區塊」的紀錄：決策、歷史、附件。
 *
 * 三個概念要分清楚，否則畫面會講錯話：
 *   決策（decision）  現況。一個區塊只有一句結論，可以改。
 *   歷史（revision）  每次儲存留一版，只追加，不覆蓋。講得出「上一次係咩」。
 *   附件（file）      指向檔案層的一個 stored_file；移除只標記，不刪列。
 *
 * 為什麼全部集中在一個 module：三張表任何一張單獨讀都會說不完整的故事
 * （有決策沒有歷史、有檔案沒有決策），所以對外只出一個 `GuideBlock` 形狀，
 * 由 `composeBlocks` 一次砌好。
 */

export type GuideBlockFile = {
  /** 附件列 id（不是 stored_file id）。改名、移除都用它。 */
  id: string;
  fileId: string;
  /** 顯示名：有改名用 label，否則用原檔名。 */
  name: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  /** 誰上載。檔案是「當時邊個放低」的證據，畫面上要講得出。 */
  uploadedByName: string;
  createdAt: string;
  removedAt: string | null;
  removedByName: string | null;
};

export type GuideBlockRevision = {
  id: string;
  decision: string;
  /** `human` 或 `agent`：歷史要講得出這一版是誰的結論。 */
  actorType: string;
  actorName: string;
  createdAt: string;
};

export type GuideBlock = {
  blockId: string;
  /** 位置編號（`00.1`）。 */
  code: string;
  title: string;
  decision: string;
  decisionAt: string | null;
  decisionByName: string | null;
  /** 目前決策由誰寫：`human`（人）或 `agent`（經 MCP）。 */
  decisionActorType: 'human' | 'agent';
  /** 為甚麼這樣揀（原因），與 decision（結論）分開。人寫或 AI 提案後確認。 */
  rationale: string;
  /** 老闆自己改過的 prompt；空字串＝用自動版本。 */
  promptOverride: string;
  revisions: GuideBlockRevision[];
  files: GuideBlockFile[];
};

type BlockRow = {
  id: string;
  block_id: string;
  block_code: string;
  block_title: string;
  decision: string;
  decision_at: Date | null;
  decision_by_name: string | null;
  decision_agent_name: string | null;
  rationale: string;
  prompt_override: string;
};

type RevisionRow = {
  id: string;
  block: string;
  decision: string;
  actor_type: string;
  actor_name: string | null;
  agent_name: string | null;
  created_at: Date;
};

type FileRow = {
  id: string;
  block: string;
  file_id: string;
  label: string;
  original_name: string;
  content_type: string;
  size_bytes: string;
  attached_by_name: string | null;
  created_at: Date;
  removed_at: Date | null;
  removed_by_name: string | null;
};

/** 區塊代號由前端 schema 提供：`set:basic`、`cat:pricing`、`dims`… 不接受任意字串。 */
const BLOCK_ID_RE = /^[a-zA-Z][a-zA-Z0-9:_-]{0,79}$/;

export const MAX_DECISION_LENGTH = 8000;
export const MAX_LABEL_LENGTH = 200;
export const MAX_PROMPT_LENGTH = 12000;

export function isBlockId(value: string): boolean {
  return BLOCK_ID_RE.test(value);
}

function emptyBlock(blockId: string): GuideBlock {
  return {
    blockId,
    code: '',
    title: '',
    decision: '',
    decisionAt: null,
    decisionByName: null,
    decisionActorType: 'human',
    rationale: '',
    promptOverride: '',
    revisions: [],
    files: [],
  };
}

/**
 * 確保區塊列存在，同時更新位置編號與名稱。
 *
 * 編號與名稱由前端 schema 決定（`00.1 業務狀態`），選項表改版時會變；紀錄
 * 不應該因此斷掉，所以只更新這兩個「標籤」欄，不動決策與歷史。
 */
async function ensureBlock(
  db: Pool | PoolClient,
  input: {
    /** null ＝ 公司層（04F 行銷內容）。 */
    brandId: string | null;
    stage: string;
    blockId: string;
    code: string;
    title: string;
    /** 有值＝這個區塊屬於某個品牌集（04B–04E、04H）；null／undefined＝品牌層。 */
    brandSetId?: string | null;
  },
): Promise<string> {
  const brandSetId = input.brandSetId ?? null;

  // 唯一鍵是三條 partial index（品牌層／品牌集見 0028，公司層見 0029），
  // 所以插入時要按 scope 講清楚衝突出現在哪一組。用一條無 WHERE 的
  // on conflict 會對不上任何一條 index。
  if (input.brandId === null) {
    const inserted = await db.query<{ id: string }>(
      `insert into brand_guide_block (brand_id, stage, block_id, block_code, block_title)
       values (null, $1, $2, $3, $4)
       on conflict (stage, block_id) where brand_id is null do nothing
       returning id`,
      [input.stage, input.blockId, input.code, input.title],
    );

    const created = inserted.rows[0]?.id;

    if (created !== undefined) {
      return created;
    }

    const existing = await db.query<{ id: string }>(
      `select id from brand_guide_block
        where brand_id is null and stage = $1 and block_id = $2`,
      [input.stage, input.blockId],
    );

    const id = existing.rows[0]?.id;

    if (id === undefined) {
      throw new Error(`公司層區塊寫入失敗：${input.stage} / ${input.blockId}`);
    }

    return id;
  }

  const inserted =
    brandSetId === null
      ? await db.query<{ id: string }>(
          `insert into brand_guide_block (brand_id, stage, block_id, block_code, block_title)
           values ($1, $2, $3, $4, $5)
           on conflict (brand_id, stage, block_id) where brand_set_id is null do nothing
           returning id`,
          [input.brandId, input.stage, input.blockId, input.code, input.title],
        )
      : await db.query<{ id: string }>(
          `insert into brand_guide_block (brand_id, brand_set_id, stage, block_id, block_code, block_title)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (brand_set_id, stage, block_id) where brand_set_id is not null do nothing
           returning id`,
          [input.brandId, brandSetId, input.stage, input.blockId, input.code, input.title],
        );

  const created = inserted.rows[0]?.id;

  if (created !== undefined) {
    return created;
  }

  const updated = await db.query<{ id: string }>(
    `update brand_guide_block
        set block_code = $4, block_title = $5
      where brand_id is not distinct from $1 and stage = $2 and block_id = $3
        and brand_set_id is not distinct from $6
        and (block_code is distinct from $4 or block_title is distinct from $5)
      returning id`,
    [input.brandId, input.stage, input.blockId, input.code, input.title, brandSetId],
  );

  const touched = updated.rows[0]?.id;

  if (touched !== undefined) {
    return touched;
  }

  const existing = await db.query<{ id: string }>(
    `select id from brand_guide_block
      where brand_id is not distinct from $1 and stage = $2 and block_id = $3
        and brand_set_id is not distinct from $4`,
    [input.brandId, input.stage, input.blockId, brandSetId],
  );

  const id = existing.rows[0]?.id;

  if (id === undefined) {
    throw new Error(`品牌引導區塊寫入失敗：${input.brandId} / ${input.stage} / ${input.blockId}`);
  }

  return id;
}

/**
 * 一個品牌一個 stage 的全部區塊（連歷史與附件），一次讀完。
 *
 * `brandSetId` 有值＝某個品牌集的 04A–04H；null＝品牌層。
 */
export async function listBlocks(
  pool: Pool,
  brandId: string | null,
  stage: string,
  brandSetId: string | null = null,
): Promise<GuideBlock[]> {
  const blocks = await pool.query<BlockRow>(
    `select b.id, b.block_id, b.block_code, b.block_title, b.decision, b.decision_at,
            b.rationale, b.prompt_override,
            u.display_name as decision_by_name,
            a.name as decision_agent_name
       from brand_guide_block b
       left join app_user u on u.id = b.decision_by
       left join agent_identity a on a.id = b.decision_agent_id
      where b.brand_id is not distinct from $1 and b.stage = $2
        and b.brand_set_id is not distinct from $3
      order by b.block_code, b.block_id`,
    [brandId, stage, brandSetId],
  );

  return composeBlocks(pool, blocks.rows);
}

/** 單一區塊（寫入之後回傳最新狀態用）。沒有紀錄就回 null。 */
export async function getBlock(
  pool: Pool,
  brandId: string | null,
  stage: string,
  blockId: string,
  brandSetId: string | null = null,
): Promise<GuideBlock | null> {
  const blocks = await pool.query<BlockRow>(
    `select b.id, b.block_id, b.block_code, b.block_title, b.decision, b.decision_at,
            b.rationale, b.prompt_override,
            u.display_name as decision_by_name,
            a.name as decision_agent_name
       from brand_guide_block b
       left join app_user u on u.id = b.decision_by
       left join agent_identity a on a.id = b.decision_agent_id
      where b.brand_id is not distinct from $1 and b.stage = $2 and b.block_id = $3
        and b.brand_set_id is not distinct from $4`,
    [brandId, stage, blockId, brandSetId],
  );

  const [composed] = await composeBlocks(pool, blocks.rows);

  return composed ?? null;
}

/**
 * 把區塊列、歷史、附件砌成對外形狀。
 *
 * 三次查詢（不是 N+1）：先拿區塊 id，再一次過拿全部歷史與全部附件。
 * 一個 stage 最多幾十個區塊，這個數量下三次查詢比逐個區塊查快得多。
 */
async function composeBlocks(
  db: Pool,
  rows: BlockRow[],
): Promise<GuideBlock[]> {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);

  const [revisions, files] = await Promise.all([
    db.query<RevisionRow>(
      `select r.id, r.block, r.decision, r.actor_type, r.created_at,
              u.display_name as actor_name,
              a.name as agent_name
         from brand_guide_block_revision r
         left join app_user u on u.id = r.actor_id
         left join agent_identity a on a.id = r.agent_id
        where r.block = any($1::uuid[])
        order by r.created_at desc, r.id desc`,
      [ids],
    ),
    db.query<FileRow>(
      `select bf.id, bf.block, bf.file_id, bf.label, f.original_name, f.content_type,
              f.size_bytes, bf.created_at, bf.removed_at,
              au.display_name as attached_by_name,
              ru.display_name as removed_by_name
         from brand_guide_block_file bf
         join stored_file f on f.id = bf.file_id
         left join app_user au on au.id = bf.attached_by
         left join app_user ru on ru.id = bf.removed_by
        where bf.block = any($1::uuid[])
        order by bf.created_at desc, bf.id desc`,
      [ids],
    ),
  ]);

  const revisionsByBlock = new Map<string, GuideBlockRevision[]>();
  for (const row of revisions.rows) {
    const list = revisionsByBlock.get(row.block) ?? [];
    list.push({
      id: row.id,
      decision: row.decision,
      actorType: row.actor_type,
      // agent 沒有 display_name，用 agent 自己的名字；兩者都空就留空，畫面不亂填。
      actorName: row.agent_name ?? row.actor_name ?? '',
      createdAt: row.created_at.toISOString(),
    });
    revisionsByBlock.set(row.block, list);
  }

  const filesByBlock = new Map<string, GuideBlockFile[]>();
  for (const row of files.rows) {
    const list = filesByBlock.get(row.block) ?? [];
    list.push({
      id: row.id,
      fileId: row.file_id,
      name: row.label !== '' ? row.label : row.original_name,
      originalName: row.original_name,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
      uploadedByName: row.attached_by_name ?? '',
      createdAt: row.created_at.toISOString(),
      removedAt: row.removed_at === null ? null : row.removed_at.toISOString(),
      removedByName: row.removed_by_name ?? null,
    });
    filesByBlock.set(row.block, list);
  }

  return rows.map((row) => ({
    blockId: row.block_id,
    code: row.block_code,
    title: row.block_title,
    decision: row.decision,
    decisionAt: row.decision_at === null ? null : row.decision_at.toISOString(),
    decisionByName: row.decision_agent_name ?? row.decision_by_name ?? null,
    decisionActorType: row.decision_agent_name === null ? 'human' : 'agent',
    rationale: row.rationale,
    promptOverride: row.prompt_override,
    revisions: revisionsByBlock.get(row.id) ?? [],
    files: filesByBlock.get(row.id) ?? [],
  }));
}

export type BlockIdentity = {
  /** null ＝ 公司層（04F 行銷內容）。 */
  brandId: string | null;
  stage: string;
  blockId: string;
  code: string;
  title: string;
  /** 有值＝這個區塊屬於某個品牌集（04A–04H）；null／undefined＝品牌層。 */
  brandSetId?: string | null;
};

/**
 * 誰寫下這個決策。人與 agent 是兩種身份，不能共用一個 actor_id：
 * 人住在 app_user，agent 住在 agent_identity，寫錯一邊就查不到名字。
 */
export type DecisionActor = { type: 'human'; userId: string } | { type: 'agent'; agentId: string };

/**
 * 儲存決策。內容有變而且非空才追加一版歷史。
 *
 * 「清除」是例外：只把現況清空，不寫一版空的歷史 —— 歷史的意義是「當時
 * 傾過咩」，空白不是一次討論。
 */
export async function saveDecision(
  pool: Pool,
  input: BlockIdentity & { decision: string; actor: DecisionActor },
): Promise<GuideBlock> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const block = await ensureBlock(client, input);

    const prior = await client.query<{ decision: string }>(
      'select decision from brand_guide_block where id = $1',
      [block],
    );

    const changed = (prior.rows[0]?.decision ?? '') !== input.decision;
    const userId = input.actor.type === 'human' ? input.actor.userId : null;
    const agentId = input.actor.type === 'agent' ? input.actor.agentId : null;

    await client.query(
      `update brand_guide_block
          set decision = $2,
              decision_by = case when btrim($2) = '' then decision_by else $3::uuid end,
              decision_agent_id = case when btrim($2) = '' then decision_agent_id else $4::uuid end,
              decision_at = case when btrim($2) = '' then decision_at else now() end,
              updated_at = now()
        where id = $1`,
      [block, input.decision, userId, agentId],
    );

    if (changed && input.decision.trim() !== '') {
      await client.query(
        `insert into brand_guide_block_revision (block, decision, actor_type, actor_id, agent_id)
         values ($1, $2, $3, $4, $5)`,
        [block, input.decision, input.actor.type, userId, agentId],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const saved = await getBlock(pool, input.brandId, input.stage, input.blockId, input.brandSetId ?? null);

  return saved ?? emptyBlock(input.blockId);
}

/**
 * 儲存老闆自己改過的 prompt。傳空字串等於還原自動版本。
 *
 * 只存文字，不存「當時的選擇快照」——自動版本才是跟選擇走的；一旦改成
 * 自訂版，畫面會講明它不會再跟選擇更新，所以不需要在這裡留一份快照。
 */
export async function savePrompt(
  pool: Pool,
  input: BlockIdentity & { prompt: string },
): Promise<GuideBlock> {
  const block = await ensureBlock(pool, input);

  await pool.query(
    `update brand_guide_block
        set prompt_override = $2, updated_at = now()
      where id = $1`,
    [block, input.prompt],
  );

  const saved = await getBlock(pool, input.brandId, input.stage, input.blockId, input.brandSetId ?? null);

  return saved ?? emptyBlock(input.blockId);
}

/**
 * 儲存區塊的 rationale（為甚麼這樣揀）。
 *
 * 與 decision 分開：decision 是「結論」（揀了哪個），rationale 是「原因」
 * （為甚麼揀）。兩者混在一個欄位會令 agent 分不清哪句是決定、哪句是理由。
 * rationale 不寫 revision 歷史（它是「原因」的現況，不是一次討論的痕跡）。
 */
export async function saveRationale(
  pool: Pool,
  input: BlockIdentity & { rationale: string },
): Promise<GuideBlock> {
  const block = await ensureBlock(pool, input);

  await pool.query(
    `update brand_guide_block
        set rationale = $2, updated_at = now()
      where id = $1`,
    [block, input.rationale],
  );

  const saved = await getBlock(pool, input.brandId, input.stage, input.blockId, input.brandSetId ?? null);

  return saved ?? emptyBlock(input.blockId);
}

/**
 * 掛一份已上傳的檔案到區塊。
 *
 * 檔案先經 `/files` 上傳（那條路徑已有大小上限、sha256、審計），這裡只負責
 * 「掛上去」。同一個檔案重複掛同一個區塊會被 unique index 擋，所以用
 * `on conflict do nothing` 當成成功 —— 使用者按兩次不應該是錯誤。
 */
export async function attachFile(
  pool: Pool,
  input: BlockIdentity & { fileId: string; label: string; actorId: string },
): Promise<GuideBlock> {
  const block = await ensureBlock(pool, input);

  await pool.query(
    `insert into brand_guide_block_file (block, file_id, label, attached_by)
     values ($1, $2, $3, $4)
     on conflict (block, file_id) where removed_at is null do nothing`,
    [block, input.fileId, input.label, input.actorId],
  );

  const saved = await getBlock(pool, input.brandId, input.stage, input.blockId, input.brandSetId ?? null);

  return saved ?? emptyBlock(input.blockId);
}

/** 移除：只標記。歷史要看得到「曾經掛過、幾時換走」。 */
export async function removeFile(
  pool: Pool,
  input: {
    brandId: string | null;
    stage: string;
    blockId: string;
    attachmentId: string;
    actorId: string;
    brandSetId?: string | null;
  },
): Promise<GuideBlock> {
  await pool.query(
    `update brand_guide_block_file bf
        set removed_at = now(), removed_by = $2
      where bf.id = $1
        and bf.removed_at is null
        and exists (
          select 1
            from brand_guide_block b
           where b.id = bf.block
             and b.brand_id is not distinct from $3 and b.stage = $4 and b.block_id = $5
             and b.brand_set_id is not distinct from $6
        )`,
    [input.attachmentId, input.actorId, input.brandId, input.stage, input.blockId, input.brandSetId ?? null],
  );

  const saved = await getBlock(pool, input.brandId, input.stage, input.blockId, input.brandSetId ?? null);

  return saved ?? emptyBlock(input.blockId);
}
