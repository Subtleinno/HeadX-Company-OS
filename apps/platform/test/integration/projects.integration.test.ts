import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectDetail } from '@company-os/contracts';
import {
  createHarness,
  createStaff,
  login,
  signUpOwner,
  type Actor,
  type Harness,
} from './identity-harness';

describe('Marketing Design Project／Brief', () => {
  let h: Harness;
  let owner: Actor;
  let brandId: string;

  beforeAll(async () => {
    h = await createHarness({ design: true });
    owner = await signUpOwner(h);
    const brand = await h.db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    const id = brand.rows[0]?.id;
    if (id === undefined) throw new Error('測試品牌建立失敗');
    brandId = id;
  });

  afterAll(async () => {
    await h.drop();
  });

  it('Staff 建立與重讀 Project，外部 agent 以 token 接手並只追加 Brief', async () => {
    const staff = await createStaff(h, owner);
    await h.db.pool.query(
      "update app_user set department = 'design', must_change_password = false where id = $1",
      [staff.id],
    );
    const staffCookie = await login(h, staff.email, staff.password);

    const requested = await h.app.inject({
      method: 'POST',
      url: '/app-grants',
      headers: { cookie: owner.cookie },
      payload: { userId: staff.id, appId: 'design', role: 'member', scope: { kind: 'all' } },
    });
    expect(requested.statusCode).toBe(201);
    const grant = (requested.json() as { grant: { id: string; version: number } }).grant;
    const approved = await h.app.inject({
      method: 'POST',
      url: `/app-grants/${grant.id}/approve`,
      headers: { cookie: owner.cookie },
      payload: { version: grant.version },
    });
    expect(approved.statusCode).toBe(200);
    expect((approved.json() as { grant: { state: string } }).grant.state).toBe('active');

    const createInput = {
      brandId,
      title: '經期前日常照顧 Carousel',
      request: '為 Moonic 建立五頁 IG Carousel，語氣溫暖，不可作醫療保證。',
    };
    const created = await h.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { cookie: staffCookie, 'idempotency-key': 'staff-project-1' },
      payload: createInput,
    });
    expect(created.statusCode).toBe(201);
    const project = (created.json() as { project: ProjectDetail }).project;
    expect(project.originalRequest.body).toBe(createInput.request);
    expect(project.state).toBe('awaiting_agent');
    expect(project.brief).toBeNull();

    const replay = await h.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { cookie: staffCookie, 'idempotency-key': 'staff-project-1' },
      payload: createInput,
    });
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as { project: { id: string }; created: boolean })).toMatchObject({
      project: { id: project.id },
      created: false,
    });

    const conflict = await h.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { cookie: staffCookie, 'idempotency-key': 'staff-project-1' },
      payload: { ...createInput, title: '另一項工作' },
    });
    expect(conflict.statusCode).toBe(409);

    const listed = await h.app.inject({
      method: 'GET',
      url: `/projects?brandId=${brandId}`,
      headers: { cookie: staffCookie },
    });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { total: number; projects: Array<{ id: string }> })).toMatchObject({
      total: 1,
      projects: [{ id: project.id }],
    });

    const agentCreated = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: owner.cookie },
      payload: { name: 'Brief agent' },
    });
    expect(agentCreated.statusCode).toBe(201);
    const agentId = (agentCreated.json() as { agent: { id: string } }).agent.id;
    const granted = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: owner.cookie },
      payload: { appId: 'design', role: 'member', scope: { kind: 'all' } },
    });
    expect(granted.statusCode).toBe(201);

    const issued = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/http-tokens`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(issued.statusCode).toBe(201);
    const issuedBody = issued.json() as { token: string; credential: { id: string } };
    expect(issuedBody.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const authorization = `Bearer ${issuedBody.token}`;

    const tokenList = await h.app.inject({
      method: 'GET',
      url: `/agents/${agentId}/http-tokens`,
      headers: { cookie: owner.cookie },
    });
    expect(tokenList.statusCode).toBe(200);
    expect(JSON.stringify(tokenList.json())).not.toContain(issuedBody.token);
    expect(JSON.stringify(tokenList.json())).not.toContain('token_hash');

    const claimed = await h.app.inject({
      method: 'POST',
      url: `/agent/projects/${project.id}/claim`,
      headers: { authorization, 'idempotency-key': 'claim-1', 'x-request-id': 'request-claim-1' },
      payload: {},
    });
    expect(claimed.statusCode).toBe(201);
    const run = (claimed.json() as { run: { id: string; agentName: string } }).run;
    expect(run.agentName).toBe('Brief agent');

    const document = {
      objective: '提供經期前日常照顧建議',
      audience: '關注經前狀態的香港女性',
      channel: 'Instagram',
      format: '五頁 Carousel',
      language: '繁體中文',
      constraints: ['不作醫療保證', '不引用未核對知識'],
      dueDate: null,
    };
    const briefCreated = await h.app.inject({
      method: 'POST',
      url: `/agent/projects/${project.id}/brief-versions`,
      headers: { authorization, 'idempotency-key': 'brief-1', 'x-request-id': 'request-brief-1' },
      payload: { runId: run.id, document },
    });
    expect(briefCreated.statusCode).toBe(201);
    const brief = (briefCreated.json() as { brief: { id: string; versionNo: number; requestId: string } }).brief;
    expect(brief).toMatchObject({ versionNo: 1, requestId: 'request-brief-1' });

    const briefReplay = await h.app.inject({
      method: 'POST',
      url: `/agent/projects/${project.id}/brief-versions`,
      headers: { authorization, 'idempotency-key': 'brief-1', 'x-request-id': 'request-brief-1' },
      payload: { runId: run.id, document },
    });
    expect(briefReplay.statusCode).toBe(200);
    expect((briefReplay.json() as { brief: { id: string }; created: boolean })).toMatchObject({
      brief: { id: brief.id },
      created: false,
    });

    const second = await h.app.inject({
      method: 'POST',
      url: `/agent/projects/${project.id}/brief-versions`,
      headers: { authorization, 'idempotency-key': 'brief-2', 'x-request-id': 'request-brief-2' },
      payload: {
        runId: run.id,
        document: { ...document, objective: '提供經期前五天日常照顧建議' },
        basedOnBriefVersionId: brief.id,
        note: '補上時間範圍',
      },
    });
    expect(second.statusCode).toBe(201);
    expect((second.json() as { brief: { versionNo: number } }).brief.versionNo).toBe(2);

    const detail = await h.app.inject({
      method: 'GET',
      url: `/projects/${project.id}`,
      headers: { cookie: staffCookie },
    });
    const detailProject = (detail.json() as { project: ProjectDetail }).project;
    expect(detailProject.brief?.versionNo).toBe(2);
    expect(detailProject.brief?.basedOnBriefVersionId).toBe(brief.id);
    expect(detailProject.briefVersions.map((version) => version.versionNo)).toEqual([2, 1]);
    expect(detailProject.originalRequest.body).toBe(createInput.request);
    expect(detailProject.state).toBe('planning');

    const audit = await h.db.pool.query<{ actor_type: string; action: string; detail: Record<string, unknown> }>(
      "select actor_type, action, detail from audit_log where action = 'project.brief.append' order by at asc",
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]).toMatchObject({
      actor_type: 'agent',
      detail: { requestId: 'request-brief-1', tokenId: issuedBody.credential.id },
    });

    await expect(
      h.db.pool.query('update design.brief_version set note = $1 where id = $2', ['改寫歷史', brief.id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      h.db.pool.query('update design.project_request set body = $1 where project_id = $2', ['改寫原文', project.id]),
    ).rejects.toMatchObject({ code: '42501' });

    const revoked = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/http-tokens/${issuedBody.credential.id}/revoke`,
      headers: { cookie: owner.cookie },
      payload: {},
    });
    expect(revoked.statusCode).toBe(200);
    const afterRevoke = await h.app.inject({
      method: 'GET',
      url: '/agent/projects',
      headers: { authorization },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it('沒有 design 授權的 Staff 不能讀寫 Projects', async () => {
    const staff = await createStaff(h, owner);
    await h.db.pool.query(
      "update app_user set department = 'design', must_change_password = false where id = $1",
      [staff.id],
    );
    const cookie = await login(h, staff.email, staff.password);
    const response = await h.app.inject({ method: 'GET', url: '/projects', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'forbidden' });
  });
});
