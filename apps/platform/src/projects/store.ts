import type { Pool, PoolClient } from 'pg';
import {
  deriveProjectState,
  type ProjectAgentRun,
  type ProjectBriefDocument,
  type ProjectBriefVersion,
  type ProjectDetail,
  type ProjectSummary,
} from '@company-os/contracts';
import { writeAudit } from '../audit.js';
import { inTransaction } from '../grants/store.js';

/** Pool 與 transaction client 共用；查詢全部用參數，不拼用戶輸入。 */
type Queryable = Pick<Pool, 'query'>;

type RunRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  request_id: string;
  claimed_at: Date;
};

type BriefRow = {
  id: string;
  version_no: number;
  document: ProjectBriefDocument;
  note: string | null;
  source_request_id: string;
  based_on_brief_version_id: string | null;
  created_by_agent: string;
  agent_name: string;
  request_id: string;
  created_at: Date;
};

type SummaryRow = {
  id: string;
  brand_id: string;
  brand_name: string;
  title: string;
  created_at: Date;
  brief_version_no: number | null;
  run_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  run_request_id: string | null;
  run_claimed_at: Date | null;
};

const SUMMARY_SELECT = `
  select p.id, p.brand_id, b.name as brand_name, p.title, p.created_at,
         latest_brief.version_no as brief_version_no,
         latest_run.id as run_id, latest_run.agent_id, latest_run.agent_name,
         latest_run.request_id as run_request_id, latest_run.claimed_at as run_claimed_at
    from design.project p
    join public.brand b on b.id = p.brand_id
    left join lateral (
      select bv.version_no from design.brief_version bv
       where bv.project_id = p.id order by bv.version_no desc limit 1
    ) latest_brief on true
    left join lateral (
      select ar.id, ar.agent_id, a.name as agent_name, ar.request_id, ar.claimed_at
        from design.agent_run ar
        join public.agent_identity a on a.id = ar.agent_id
       where ar.project_id = p.id order by ar.claimed_at desc, ar.id desc limit 1
    ) latest_run on true`;

function runOf(row: RunRow): ProjectAgentRun {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    requestId: row.request_id,
    claimedAt: row.claimed_at.toISOString(),
  };
}

function briefOf(row: BriefRow): ProjectBriefVersion {
  return {
    id: row.id,
    versionNo: row.version_no,
    document: row.document,
    note: row.note,
    sourceRequestId: row.source_request_id,
    basedOnBriefVersionId: row.based_on_brief_version_id,
    agentId: row.created_by_agent,
    agentName: row.agent_name,
    requestId: row.request_id,
    createdAt: row.created_at.toISOString(),
  };
}

function summaryOf(row: SummaryRow): ProjectSummary {
  const agentRun: ProjectAgentRun | null =
    row.run_id === null ||
    row.agent_id === null ||
    row.agent_name === null ||
    row.run_request_id === null ||
    row.run_claimed_at === null
      ? null
      : {
          id: row.run_id,
          agentId: row.agent_id,
          agentName: row.agent_name,
          requestId: row.run_request_id,
          claimedAt: row.run_claimed_at.toISOString(),
        };

  return {
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    title: row.title,
    state: deriveProjectState({
      hasAgentRun: agentRun !== null,
      hasBrief: row.brief_version_no !== null,
      // Needs／Composition／Render／Output 尚未在這一刀建立，不能憑空當成事實。
      openNeedCount: 0,
      hasCompleteComposition: false,
      hasActiveRender: false,
      hasOutput: false,
      receivedAt: null,
    }),
    briefVersionNo: row.brief_version_no,
    agentRun,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listProjects(
  pool: Pool,
  brandId?: string,
): Promise<{ projects: ProjectSummary[]; total: number }> {
  const values = brandId === undefined ? [] : [brandId];
  const where = brandId === undefined ? '' : 'where p.brand_id = $1';
  const rows = await pool.query<SummaryRow>(
    `${SUMMARY_SELECT} ${where} order by p.created_at desc, p.id desc`,
    values,
  );
  const count = await pool.query<{ total: number }>(
    `select count(*)::int as total from design.project ${brandId === undefined ? '' : 'where brand_id = $1'}`,
    values,
  );

  return { projects: rows.rows.map(summaryOf), total: count.rows[0]?.total ?? 0 };
}

async function findRun(db: Queryable, id: string): Promise<ProjectAgentRun | null> {
  const rows = await db.query<RunRow>(
    `select ar.id, ar.agent_id, a.name as agent_name, ar.request_id, ar.claimed_at
       from design.agent_run ar join public.agent_identity a on a.id = ar.agent_id
      where ar.id = $1`,
    [id],
  );
  const row = rows.rows[0];
  return row === undefined ? null : runOf(row);
}

async function findBrief(db: Queryable, id: string): Promise<ProjectBriefVersion | null> {
  const rows = await db.query<BriefRow>(
    `select bv.id, bv.version_no, bv.document, bv.note, bv.source_request_id,
            bv.based_on_brief_version_id, bv.created_by_agent, a.name as agent_name,
            bv.request_id, bv.created_at
       from design.brief_version bv
       join public.agent_identity a on a.id = bv.created_by_agent
      where bv.id = $1`,
    [id],
  );
  const row = rows.rows[0];
  return row === undefined ? null : briefOf(row);
}

export async function getProjectDetail(pool: Pool, id: string): Promise<ProjectDetail | null> {
  const base = await pool.query<SummaryRow>(
    `${SUMMARY_SELECT}
     where p.id = $1`,
    [id],
  );
  const row = base.rows[0];
  if (row === undefined) return null;

  const request = await pool.query<{
    id: string;
    body: string;
    created_by: string;
    created_at: Date;
  }>('select id, body, created_by, created_at from design.project_request where project_id = $1', [id]);
  const original = request.rows[0];
  if (original === undefined) throw new Error('Project 缺少原始要求');

  const versions = await pool.query<BriefRow>(
    `select bv.id, bv.version_no, bv.document, bv.note, bv.source_request_id,
            bv.based_on_brief_version_id, bv.created_by_agent, a.name as agent_name,
            bv.request_id, bv.created_at
       from design.brief_version bv
       join public.agent_identity a on a.id = bv.created_by_agent
      where bv.project_id = $1 order by bv.version_no desc`,
    [id],
  );

  return {
    ...summaryOf(row),
    originalRequest: {
      id: original.id,
      body: original.body,
      createdBy: original.created_by,
      createdAt: original.created_at.toISOString(),
    },
    brief: versions.rows[0] === undefined ? null : briefOf(versions.rows[0]),
    briefVersions: versions.rows.map(briefOf),
  };
}

export type CreateProjectResult =
  | { status: 'ok'; projectId: string; created: boolean }
  | { status: 'brand_not_found' }
  | { status: 'idempotency_conflict' };

export async function createProject(
  pool: Pool,
  input: {
    brandId: string;
    title: string;
    request: string;
    actorId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<CreateProjectResult> {
  return inTransaction(pool, async (client) => {
    const brand = await client.query<{ id: string }>('select id from public.brand where id = $1', [input.brandId]);
    if (brand.rows[0] === undefined) return { status: 'brand_not_found' as const };

    const inserted = await client.query<{ id: string }>(
      `insert into design.project
        (brand_id, title, created_by, idempotency_key, idempotency_hash)
       values ($1, $2, $3, $4, $5)
       on conflict (created_by, idempotency_key) do nothing returning id`,
      [input.brandId, input.title, input.actorId, input.idempotencyKey, input.requestHash],
    );

    let projectId = inserted.rows[0]?.id;
    const created = projectId !== undefined;

    if (projectId === undefined) {
      const existing = await client.query<{ id: string; hash: string }>(
        `select id, idempotency_hash as hash from design.project
          where created_by = $1 and idempotency_key = $2`,
        [input.actorId, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (row === undefined) throw new Error('Project 幂等重試讀不到既有列');
      if (row.hash !== input.requestHash) return { status: 'idempotency_conflict' as const };
      projectId = row.id;
    }

    if (created) {
      await client.query(
        `insert into design.project_request (project_id, body, created_by) values ($1, $2, $3)`,
        [projectId, input.request, input.actorId],
      );
      await audit(client, {
        actorType: 'human',
        actorId: input.actorId,
        action: 'project.create',
        target: projectId,
        detail: { brandId: input.brandId, title: input.title },
      });
    }

    return { status: 'ok' as const, projectId, created };
  });
}

export type ClaimRunResult =
  | { status: 'ok'; run: ProjectAgentRun; created: boolean }
  | { status: 'project_not_found' }
  | { status: 'idempotency_conflict' };

export async function claimAgentRun(
  pool: Pool,
  input: {
    projectId: string;
    agentId: string;
    tokenId: string;
    requestId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<ClaimRunResult> {
  return inTransaction(pool, async (client) => {
    const project = await client.query<{ id: string }>('select id from design.project where id = $1', [input.projectId]);
    if (project.rows[0] === undefined) return { status: 'project_not_found' as const };

    const inserted = await client.query<{ id: string }>(
      `insert into design.agent_run
        (project_id, agent_id, token_id, request_id, idempotency_key, idempotency_hash)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (agent_id, idempotency_key) do nothing returning id`,
      [input.projectId, input.agentId, input.tokenId, input.requestId, input.idempotencyKey, input.requestHash],
    );

    let runId = inserted.rows[0]?.id;
    const created = runId !== undefined;

    if (runId === undefined) {
      const existing = await client.query<{ id: string; hash: string }>(
        `select id, idempotency_hash as hash from design.agent_run
          where agent_id = $1 and idempotency_key = $2`,
        [input.agentId, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (row === undefined) throw new Error('agent run 幂等重試讀不到既有列');
      if (row.hash !== input.requestHash) return { status: 'idempotency_conflict' as const };
      runId = row.id;
    }

    if (created) {
      await audit(client, {
        actorType: 'agent',
        actorId: input.agentId,
        action: 'project.agent.claim',
        target: input.projectId,
        detail: { runId, requestId: input.requestId, tokenId: input.tokenId },
      });
    }

    const run = await findRun(client, runId);
    if (run === null) throw new Error('建立或讀回 agent run 失敗');
    return { status: 'ok' as const, run, created };
  });
}

export type AppendBriefResult =
  | { status: 'ok'; brief: ProjectBriefVersion; created: boolean }
  | { status: 'project_not_found' }
  | { status: 'run_not_found' }
  | { status: 'base_not_found' }
  | { status: 'idempotency_conflict' };

export async function appendBriefVersion(
  pool: Pool,
  input: {
    projectId: string;
    runId: string;
    document: ProjectBriefDocument;
    note: string | null;
    basedOnBriefVersionId: string | null;
    agentId: string;
    tokenId: string;
    requestId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<AppendBriefResult> {
  return inTransaction(pool, async (client) => {
    const locked = await client.query<{ id: string }>(
      'select id from design.project where id = $1 for update',
      [input.projectId],
    );
    if (locked.rows[0] === undefined) return { status: 'project_not_found' as const };

    const existing = await client.query<{ id: string; hash: string }>(
      `select id, idempotency_hash as hash from design.brief_version
        where created_by_agent = $1 and idempotency_key = $2`,
      [input.agentId, input.idempotencyKey],
    );
    const previous = existing.rows[0];
    if (previous !== undefined) {
      if (previous.hash !== input.requestHash) return { status: 'idempotency_conflict' as const };
      const brief = await findBrief(client, previous.id);
      if (brief === null) throw new Error('Brief 幂等重試讀不到既有版本');
      return { status: 'ok' as const, brief, created: false };
    }

    const run = await client.query<{ id: string }>(
      `select id from design.agent_run
        where id = $1 and project_id = $2 and agent_id = $3`,
      [input.runId, input.projectId, input.agentId],
    );
    if (run.rows[0] === undefined) return { status: 'run_not_found' as const };

    if (input.basedOnBriefVersionId !== null) {
      const basedOn = await client.query<{ id: string }>(
        'select id from design.brief_version where id = $1 and project_id = $2',
        [input.basedOnBriefVersionId, input.projectId],
      );
      if (basedOn.rows[0] === undefined) return { status: 'base_not_found' as const };
    }

    const source = await client.query<{ id: string }>(
      'select id from design.project_request where project_id = $1',
      [input.projectId],
    );
    const sourceRequest = source.rows[0];
    if (sourceRequest === undefined) throw new Error('Project 缺少原始要求');

    const next = await client.query<{ version_no: number }>(
      'select coalesce(max(version_no), 0) + 1 as version_no from design.brief_version where project_id = $1',
      [input.projectId],
    );
    const versionNo = next.rows[0]?.version_no;
    if (versionNo === undefined) throw new Error('計算 Brief 版本號失敗');

    const inserted = await client.query<{ id: string }>(
      `insert into design.brief_version
        (project_id, run_id, version_no, document, note, source_request_id,
         based_on_brief_version_id, created_by_agent, token_id, request_id,
         idempotency_key, idempotency_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (created_by_agent, idempotency_key) do nothing returning id`,
      [
        input.projectId,
        input.runId,
        versionNo,
        input.document,
        input.note,
        sourceRequest.id,
        input.basedOnBriefVersionId,
        input.agentId,
        input.tokenId,
        input.requestId,
        input.idempotencyKey,
        input.requestHash,
      ],
    );

    const insertedId = inserted.rows[0]?.id;
    if (insertedId === undefined) {
      // 同一 agent 在不同 Project 上重用 key 時，兩個 project lock 不會互相等待；
      // 唯一索引仍是最後防線，這裡讀回並比對完整請求摘要。
      const raced = await client.query<{ id: string; hash: string }>(
        `select id, idempotency_hash as hash from design.brief_version
          where created_by_agent = $1 and idempotency_key = $2`,
        [input.agentId, input.idempotencyKey],
      );
      const row = raced.rows[0];
      if (row === undefined) throw new Error('Brief 並發重試讀不到既有版本');
      if (row.hash !== input.requestHash) return { status: 'idempotency_conflict' as const };
      const brief = await findBrief(client, row.id);
      if (brief === null) throw new Error('Brief 並發重試讀不到內容');
      return { status: 'ok' as const, brief, created: false };
    }

    await audit(client, {
      actorType: 'agent',
      actorId: input.agentId,
      action: 'project.brief.append',
      target: input.projectId,
      detail: {
        briefVersionId: insertedId,
        versionNo,
        runId: input.runId,
        sourceRequestId: sourceRequest.id,
        basedOnBriefVersionId: input.basedOnBriefVersionId,
        requestId: input.requestId,
        tokenId: input.tokenId,
      },
    });

    const brief = await findBrief(client, insertedId);
    if (brief === null) throw new Error('建立 Brief 之後讀不到版本');
    return { status: 'ok' as const, brief, created: true };
  });
}

function audit(client: PoolClient, entry: Parameters<typeof writeAudit>[1]): Promise<void> {
  return writeAudit({ query: (text, values) => client.query(text, values) }, entry);
}
