import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHashLimiter } from '../../src/auth/hash-limits';
import {
  createHarness,
  createStaff,
  insertStaffRow,
  login,
  signUpOwner,
  type Actor,
  type Harness,
} from './identity-harness';

/**
 * 員工與 agent 身份底座（issue #84）。
 *
 * 這一張的危險點與 #83 不同：#83 是「授權多了」，這一張是「身份多了」而且
 * 牽涉密碼與 session。所以除了功能，還要驗：
 *   - 新帳戶零授權（default deny 不是口號，是資料庫裡真的 0 列）
 *   - 停用與撤銷 session 在同一交易，舊 cookie 即時 401
 *   - 首次改密碼的閘門真的擋住其他功能
 *   - agent 冇密碼、登入不到、批准不了、只可以做 member
 *   - 雜湊滿載時回 503 而不是排到死，而且不洩漏帳戶存在
 */

const password = (): string => randomBytes(18).toString('base64url');

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  await h.app.close();
  await h.drop();
});

async function owner(): Promise<Actor> {
  return signUpOwner(h);
}

type Json = Record<string, unknown>;

function json(response: { json: () => unknown }): Json {
  return response.json() as Json;
}

describe('migration 0007：身份與授權主體的相容性', () => {
  it('app_user 多了 must_change_password，舊帳戶預設 false', async () => {
    const legacy = await insertStaffRow(h);

    const rows = await h.db.pool.query<{ must_change_password: boolean }>(
      'select must_change_password from app_user where id = $1',
      [legacy.id],
    );

    expect(rows.rows[0]?.must_change_password).toBe(false);
  });

  it('agent_identity 有 id、name、created_by、created_at、disabled_at', async () => {
    const boss = await owner();

    const rows = await h.db.pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_name = 'agent_identity' order by column_name`,
    );

    expect(rows.rows.map((row) => row.column_name)).toEqual([
      'created_at',
      'created_by',
      'disabled_at',
      'id',
      'name',
    ]);

    // created_by 一定要有人：agent 不可以憑空出現。
    const fk = await h.db.pool.query<{ delete_rule: string }>(
      `select rc.delete_rule
       from information_schema.referential_constraints rc
       join information_schema.key_column_usage k
         on k.constraint_name = rc.constraint_name
       where k.table_name = 'agent_identity' and k.column_name = 'created_by'`,
    );

    expect(fk.rows[0]?.delete_rule).toBe('NO ACTION');

    const inserted = await h.db.pool.query(
      `insert into agent_identity (name, created_by) values ('測試 agent', $1) returning id`,
      [boss.id],
    );

    expect(inserted.rowCount).toBe(1);
  });

  it('一筆授權只可以指向一個人或一個 agent（兩者都給或都不給都寫不入）', async () => {
    const boss = await owner();
    const staff = await insertStaffRow(h);

    const agent = await h.db.pool.query<{ id: string }>(
      `insert into agent_identity (name, created_by) values ('甲', $1) returning id`,
      [boss.id],
    );
    const agentId = agent.rows[0]?.id;

    const insert = (userId: string | null, agentIdOrNull: string | null): Promise<unknown> =>
      h.db.pool.query(
        `insert into app_grant (user_id, agent_id, app_id, role, scope_kind, state, requested_by)
         values ($1, $2, 'sales', 'member', 'all', 'requested', $3)`,
        [userId, agentIdOrNull, boss.id],
      );

    await expect(insert(staff.id, agentId ?? null)).rejects.toMatchObject({ code: '23514' });
    await expect(insert(null, null)).rejects.toMatchObject({ code: '23514' });

    // 只有一個主體：寫得入。
    await expect(insert(staff.id, null)).resolves.toBeDefined();
    await expect(insert(null, agentId ?? null)).resolves.toBeDefined();
  });

  it('agent 的授權只可以是 member，不可以做 app_admin', async () => {
    const boss = await owner();

    const agent = await h.db.pool.query<{ id: string }>(
      `insert into agent_identity (name, created_by) values ('乙', $1) returning id`,
      [boss.id],
    );

    await expect(
      h.db.pool.query(
        `insert into app_grant (agent_id, app_id, role, scope_kind, state, requested_by)
         values ($1, 'sales', 'app_admin', 'all', 'requested', $2)`,
        [agent.rows[0]?.id, boss.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('既有的人類授權列仍然有效（升級相容）', async () => {
    const boss = await owner();
    const staff = await insertStaffRow(h);

    await h.db.pool.query(
      `insert into app_grant (user_id, app_id, role, scope_kind, state, requested_by, approved_by, approved_at, activated_at)
       values ($1, 'sales', 'member', 'all', 'active', $2, $2, now(), now())`,
      [staff.id, boss.id],
    );

    const rows = await h.db.pool.query<{ user_id: string; agent_id: string | null }>(
      'select user_id, agent_id from app_grant where user_id = $1',
      [staff.id],
    );

    expect(rows.rows[0]).toEqual({ user_id: staff.id, agent_id: null });
  });

  it('授權的主體不可以原地由人改成 agent', async () => {
    const boss = await owner();
    const staff = await insertStaffRow(h);

    const agent = await h.db.pool.query<{ id: string }>(
      `insert into agent_identity (name, created_by) values ('丙', $1) returning id`,
      [boss.id],
    );

    const inserted = await h.db.pool.query<{ id: string }>(
      `insert into app_grant (user_id, app_id, role, scope_kind, state, requested_by)
       values ($1, 'sales', 'member', 'all', 'requested', $2) returning id`,
      [staff.id, boss.id],
    );

    await expect(
      h.db.pool.query('update app_grant set agent_id = $1, user_id = null where id = $2', [
        agent.rows[0]?.id,
        inserted.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('建立員工', () => {
  it('老闆建立員工：201、角色是 staff、要改密碼、零授權', async () => {
    const boss = await owner();
    const created = await createStaff(h, boss);

    const row = await h.db.pool.query<{
      role: string;
      must_change_password: boolean;
      department: string | null;
    }>('select role, must_change_password, department from app_user where id = $1', [created.id]);

    expect(row.rows[0]).toEqual({ role: 'staff', must_change_password: true, department: null });

    const grants = await h.db.pool.query<{ count: string }>(
      'select count(*)::text as count from app_grant where user_id = $1',
      [created.id],
    );

    expect(grants.rows[0]?.count).toBe('0');
  });

  it('回應不含密碼或雜湊', async () => {
    const boss = await owner();
    const response = await h.app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: boss.cookie },
      payload: { displayName: '員工', email: 'a@example.com', initialPassword: password() },
    });

    expect(response.statusCode).toBe(201);

    const text = response.body;
    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('initialPassword');
    expect(text).not.toContain('password_hash');
  });

  it('寫審計 staff.create，detail 沒有密碼', async () => {
    const boss = await owner();
    const created = await createStaff(h, boss);

    const rows = await h.db.pool.query<{ actor_id: string; target: string; detail: Json }>(
      `select actor_id, target, detail from audit_log where action = 'staff.create' and target = $1`,
      [created.id],
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.actor_id).toBe(boss.id);
    expect(JSON.stringify(rows.rows[0]?.detail)).not.toContain('scrypt');
  });

  it('未登入 401、員工 403', async () => {
    const anonymous = await h.app.inject({
      method: 'POST',
      url: '/staff',
      payload: { displayName: 'x', email: 'x@example.com', initialPassword: password() },
    });
    expect(anonymous.statusCode).toBe(401);

    const boss = await owner();
    const staff = await createStaff(h, boss);
    const staffCookie = await login(h, staff.email, staff.password);

    const forbidden = await h.app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: staffCookie },
      payload: { displayName: 'y', email: 'y@example.com', initialPassword: password() },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('重複 email（大小寫不同）回 409', async () => {
    const boss = await owner();
    const created = await createStaff(h, boss);

    const response = await h.app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: boss.cookie },
      payload: {
        displayName: '重複',
        email: created.email.toUpperCase(),
        initialPassword: password(),
      },
    });

    expect(response.statusCode).toBe(409);
    expect(json(response)['error']).toBe('duplicate_email');
  });

  it('未知欄位、缺欄位、太短的密碼都回 422', async () => {
    const boss = await owner();

    const cases: Json[] = [
      { displayName: 'x', email: 'ok@example.com', initialPassword: password(), role: 'owner' },
      { displayName: 'x', email: 'ok@example.com' },
      { displayName: '', email: 'ok@example.com', initialPassword: password() },
      { displayName: 'x', email: 'not-an-email', initialPassword: password() },
      { displayName: 'x', email: 'ok@example.com', initialPassword: 'short' },
    ];

    for (const payload of cases) {
      const response = await h.app.inject({
        method: 'POST',
        url: '/staff',
        headers: { cookie: boss.cookie },
        payload,
      });

      expect(response.statusCode, JSON.stringify(payload)).toBe(422);
    }
  });

  it('不可以經 API 建立第二個老闆（role 不是可接受欄位）', async () => {
    const boss = await owner();

    const response = await h.app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: boss.cookie },
      payload: {
        displayName: '假老闆',
        email: 'fake-owner@example.com',
        initialPassword: password(),
        role: 'owner',
      },
    });

    expect(response.statusCode).toBe(422);

    const owners = await h.db.pool.query<{ count: string }>(
      "select count(*)::text as count from app_user where role = 'owner'",
    );

    expect(owners.rows[0]?.count).toBe('1');
  });
});

describe('員工列表', () => {
  it('分頁與穩定排序（建立次序，不因名字而變）', async () => {
    const boss = await owner();
    const first = await createStaff(h, boss, { displayName: 'Zoe' });
    const second = await createStaff(h, boss, { displayName: 'Amy' });

    const page = await h.app.inject({
      method: 'GET',
      url: '/staff?limit=1&offset=0',
      headers: { cookie: boss.cookie },
    });

    expect(page.statusCode).toBe(200);
    const body = json(page) as { staff: Array<{ id: string }>; total: number };

    expect(body.total).toBe(2);
    expect(body.staff.map((row) => row.id)).toEqual([first.id]);

    const next = await h.app.inject({
      method: 'GET',
      url: '/staff?limit=1&offset=1',
      headers: { cookie: boss.cookie },
    });

    expect((json(next) as { staff: Array<{ id: string }> }).staff.map((row) => row.id)).toEqual([
      second.id,
    ]);
  });

  it('列表不含老闆自己，也不含密碼', async () => {
    const boss = await owner();
    await createStaff(h, boss);

    const response = await h.app.inject({
      method: 'GET',
      url: '/staff',
      headers: { cookie: boss.cookie },
    });

    const body = json(response) as { staff: Array<{ id: string }> };
    expect(body.staff.map((row) => row.id)).not.toContain(boss.id);
    expect(response.body).not.toContain('scrypt');
  });

  it('不合法的查詢參數回 422', async () => {
    const boss = await owner();

    const response = await h.app.inject({
      method: 'GET',
      url: '/staff?limit=1000',
      headers: { cookie: boss.cookie },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('首次改密碼的閘門', () => {
  it('未改密碼之前只可以讀自己、改密碼、登出，其他一律 403', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    const me = await h.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);

    const state = await h.app.inject({ method: 'GET', url: '/auth/state', headers: { cookie } });
    expect(state.statusCode).toBe(200);

    const blocked = await h.app.inject({
      method: 'GET',
      url: '/app-grants',
      headers: { cookie },
    });
    expect(blocked.statusCode).toBe(403);
    expect(json(blocked)['error']).toBe('password_change_required');
  });

  it('改密碼成功：旗標清除、舊 session 全部失效、新 cookie 可用', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const oldCookie = await login(h, staff.email, staff.password);
    const newPassword = password();

    const changed = await h.app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie: oldCookie },
      payload: { currentPassword: staff.password, newPassword },
    });

    expect(changed.statusCode).toBe(200);

    const raw = changed.headers['set-cookie'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const newCookie = String(value).split(';')[0] ?? '';

    const oldSession = await h.app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: oldCookie },
    });
    expect(oldSession.statusCode).toBe(401);

    const stillPending = await h.app.inject({
      method: 'GET',
      url: '/app-grants',
      headers: { cookie: newCookie },
    });
    expect(stillPending.statusCode).toBe(200);

    const row = await h.db.pool.query<{ must_change_password: boolean }>(
      'select must_change_password from app_user where id = $1',
      [staff.id],
    );
    expect(row.rows[0]?.must_change_password).toBe(false);
  });

  it('舊密碼錯 403、新密碼等於舊 422', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    const wrong = await h.app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie },
      payload: { currentPassword: 'wrong-password-1234', newPassword: password() },
    });
    expect(wrong.statusCode).toBe(403);
    expect(json(wrong)['error']).toBe('invalid_current_password');

    const same = await h.app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: staff.password },
    });
    expect(same.statusCode).toBe(422);
  });

  it('改密碼寫審計 staff.password_change', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    await h.app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: password() },
    });

    const rows = await h.db.pool.query(
      `select 1 from audit_log where action = 'staff.password_change' and target = $1`,
      [staff.id],
    );

    expect(rows.rowCount).toBe(1);
  });

  it('已經改過密碼的員工不再被擋', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    const changed = await h.app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: password() },
    });

    const raw = changed.headers['set-cookie'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const fresh = String(value).split(';')[0] ?? '';

    const allowed = await h.app.inject({ method: 'GET', url: '/app-grants', headers: { cookie: fresh } });
    expect(allowed.statusCode).toBe(200);
  });
});

describe('停用員工', () => {
  it('停用之後舊 cookie 即時 401，而且登入不到', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    await h.app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: password() },
    });

    const disabled = await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });

    expect(disabled.statusCode).toBe(200);

    const after = await h.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);

    const retry = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: staff.email, password: staff.password },
    });
    expect(retry.statusCode).toBe(401);
  });

  it('停用與撤銷 session 在同一交易：停用後沒有任何未撤銷 session', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    await login(h, staff.email, staff.password);
    await login(h, staff.email, staff.password);

    await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });

    const rows = await h.db.pool.query<{ count: string }>(
      `select count(*)::text as count from auth_session
       where user_id = $1 and revoked_at is null`,
      [staff.id],
    );

    expect(rows.rows[0]?.count).toBe('0');
  });

  it('停用寫審計 staff.disable', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);

    await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });

    const rows = await h.db.pool.query(
      `select 1 from audit_log where action = 'staff.disable' and target = $1`,
      [staff.id],
    );

    expect(rows.rowCount).toBe(1);
  });

  it('不可以停用老闆（409），也不可以停用不存在的帳戶（404）', async () => {
    const boss = await owner();

    const self = await h.app.inject({
      method: 'POST',
      url: `/staff/${boss.id}/disable`,
      headers: { cookie: boss.cookie },
    });
    expect(self.statusCode).toBe(409);
    expect(json(self)['error']).toBe('owner_protected');

    const missing = await h.app.inject({
      method: 'POST',
      url: '/staff/00000000-0000-4000-8000-000000000000/disable',
      headers: { cookie: boss.cookie },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('重複停用回 409', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);

    await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });

    const again = await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });

    expect(again.statusCode).toBe(409);
  });

  it('停用與登入同時發生，不會留下可用 session', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);

    const loggingIn = h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: staff.email, password: staff.password },
    });

    const disabling = h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });

    const [loginResult, disableResult] = await Promise.all([loggingIn, disabling]);
    expect(disableResult.statusCode).toBe(200);

    const live = await h.db.pool.query<{ count: string }>(
      `select count(*)::text as count from auth_session
       where user_id = $1 and revoked_at is null`,
      [staff.id],
    );

    expect(live.rows[0]?.count).toBe('0');

    if (loginResult.statusCode === 200) {
      const raw = loginResult.headers['set-cookie'];
      const value = Array.isArray(raw) ? raw[0] : raw;
      const cookie = String(value).split(';')[0] ?? '';
      const me = await h.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
      expect(me.statusCode).toBe(401);
    } else {
      // 或者它乾脆不簽發 session（401）。兩種都可以，靜靜簽發就不可以。
      expect(loginResult.statusCode).toBe(401);
    }
  });
});

describe('agent 身份', () => {
  it('老闆建立 agent：201、零授權、無密碼欄位', async () => {
    const boss = await owner();

    const response = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: '研究助手' },
    });

    expect(response.statusCode).toBe(201);
    const body = json(response) as { agent: { id: string; name: string } };
    expect(body.agent.name).toBe('研究助手');

    const grants = await h.db.pool.query<{ count: string }>(
      'select count(*)::text as count from app_grant where agent_id = $1',
      [body.agent.id],
    );
    expect(grants.rows[0]?.count).toBe('0');

    expect(response.body).not.toContain('password');
  });

  it('重複名稱 409，空白名稱 422，員工 403', async () => {
    const boss = await owner();
    await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: '同名' },
    });

    const duplicate = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: '同名' },
    });
    expect(duplicate.statusCode).toBe(409);

    const blank = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: '   ' },
    });
    expect(blank.statusCode).toBe(422);

    const staff = await createStaff(h, boss);
    const staffCookie = await login(h, staff.email, staff.password);
    const forbidden = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: staffCookie },
      payload: { name: '偷偷建' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('agent 登入不到（沒有密碼，也沒有 session）', async () => {
    const boss = await owner();
    await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: '登入測試' },
    });

    for (const attempt of ['登入測試', '登入測試@example.com']) {
      const response = await h.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: attempt, password: password() },
      });

      // agent 沒有 email，名字本身就過不了 email 格式（400）；有 email 形狀的
      // 亦一定對不上任何 app_user（401）。兩者都不可以發 cookie。
      expect([400, 401]).toContain(response.statusCode);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('停用 agent 寫審計，重複停用 409', async () => {
    const boss = await owner();
    const created = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: '停用測試' },
    });
    const agentId = (json(created) as { agent: { id: string } }).agent.id;

    const first = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/disable`,
      headers: { cookie: boss.cookie },
    });
    expect(first.statusCode).toBe(200);

    const again = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/disable`,
      headers: { cookie: boss.cookie },
    });
    expect(again.statusCode).toBe(409);

    const audit = await h.db.pool.query(
      `select 1 from audit_log where action = 'agent.disable' and target = $1`,
      [agentId],
    );
    expect(audit.rowCount).toBe(1);
  });
});

describe('agent 授權接線', () => {
  async function createAgent(boss: Actor): Promise<string> {
    const response = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: `agent-${randomBytes(3).toString('hex')}` },
    });

    expect(response.statusCode).toBe(201);

    return (json(response) as { agent: { id: string } }).agent.id;
  }

  it('老闆可以給 agent 明確範圍的 member 授權，即刻生效並寫審計', async () => {
    const boss = await owner();
    const agentId = await createAgent(boss);

    const response = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
      payload: { appId: 'sales', role: 'member', scope: { kind: 'units', unitIds: [h.units.hk] } },
    });

    expect(response.statusCode).toBe(201);

    const grant = json(response) as { grant: { state: string; scope: Json } };
    expect(grant.grant.state).toBe('active');

    const audit = await h.db.pool.query(
      `select 1 from audit_log where action = 'agent.grant.activate' and target = $1`,
      [agentId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('agent 不可以做 app_admin（422），範圍不可以省略（422）', async () => {
    const boss = await owner();
    const agentId = await createAgent(boss);

    const admin = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
      payload: { appId: 'sales', role: 'app_admin', scope: { kind: 'all' } },
    });
    expect(admin.statusCode).toBe(422);

    const noScope = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
      payload: { appId: 'sales', role: 'member' },
    });
    expect(noScope.statusCode).toBe(422);
  });

  it('員工不可以管理 agent 授權（403）', async () => {
    const boss = await owner();
    const agentId = await createAgent(boss);
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    const response = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie },
      payload: { appId: 'sales', role: 'member', scope: { kind: 'all' } },
    });

    expect(response.statusCode).toBe(403);
  });

  it('未停用時經 #82 判斷為允許（via grant），停用之後即刻拒絕', async () => {
    const boss = await owner();
    const agentId = await createAgent(boss);

    await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
      payload: { appId: 'sales', role: 'member', scope: { kind: 'all' } },
    });

    const allowed = await h.app.inject({
      method: 'GET',
      url: `/agents/${agentId}/access/sales`,
      headers: { cookie: boss.cookie },
    });

    expect(allowed.statusCode).toBe(200);
    expect(json(allowed)).toMatchObject({ allowed: true, via: 'grant' });

    await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/disable`,
      headers: { cookie: boss.cookie },
    });

    const denied = await h.app.inject({
      method: 'GET',
      url: `/agents/${agentId}/access/sales`,
      headers: { cookie: boss.cookie },
    });

    expect(json(denied)).toMatchObject({ allowed: false, reason: 'identity_disabled' });
  });

  it('撤銷之後拒絕，版本不對回 409', async () => {
    const boss = await owner();
    const agentId = await createAgent(boss);

    const created = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
      payload: { appId: 'sales', role: 'member', scope: { kind: 'all' } },
    });
    const grant = (json(created) as { grant: { id: string; version: number } }).grant;

    // requested → approved → active 是三個轉換，所以生效之後的版本號不是 1。
    // 客戶端要用回應給的版本號，而不是自己記住的。
    const stale = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants/${grant.id}/revoke`,
      headers: { cookie: boss.cookie },
      payload: { version: grant.version + 99 },
    });
    expect(stale.statusCode).toBe(409);

    const revoked = await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants/${grant.id}/revoke`,
      headers: { cookie: boss.cookie },
      payload: { version: grant.version },
    });
    expect(revoked.statusCode).toBe(200);

    const denied = await h.app.inject({
      method: 'GET',
      url: `/agents/${agentId}/access/sales`,
      headers: { cookie: boss.cookie },
    });
    expect(json(denied)).toMatchObject({ allowed: false, reason: 'grant_missing' });
  });

  it('列表只見到該 agent 的授權，並有總數', async () => {
    const boss = await owner();
    const agentId = await createAgent(boss);

    await h.app.inject({
      method: 'POST',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
      payload: { appId: 'sales', role: 'member', scope: { kind: 'all' } },
    });

    const list = await h.app.inject({
      method: 'GET',
      url: `/agents/${agentId}/grants`,
      headers: { cookie: boss.cookie },
    });

    expect(list.statusCode).toBe(200);
    const body = json(list) as { grants: Array<{ agentId: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.grants[0]?.agentId).toBe(agentId);
  });
});

describe('雜湊資源保護', () => {
  it('滿載時建立員工回 503 加 Retry-After，不會排到死', async () => {
    const boss = await owner();

    // 用一個 1 併發、0 排隊的限制器，塞滿它。
    h.limiter.current = createHashLimiter({ maxConcurrent: 1, maxQueue: 0, timeoutMs: 1_000 });

    let release: () => void = () => undefined;
    const held = h.limiter.current.run(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const response = await h.app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: boss.cookie },
      payload: { displayName: '忙碌', email: 'busy@example.com', initialPassword: password() },
    });

    expect(response.statusCode).toBe(503);
    expect(json(response)['error']).toBe('service_busy');
    expect(response.headers['retry-after']).toBeDefined();

    release();
    await held;
  });

  it('滿載時登入一樣回 503，不是 401（不洩漏帳戶存在）', async () => {
    h.limiter.current = createHashLimiter({ maxConcurrent: 1, maxQueue: 0, timeoutMs: 1_000 });

    let release: () => void = () => undefined;
    const held = h.limiter.current.run(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const response = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: password() },
    });

    expect(response.statusCode).toBe(503);
    expect(json(response)['error']).toBe('service_busy');

    release();
    await held;
  });

  it('名額放開之後同一個請求可以成功', async () => {
    const boss = await owner();

    h.limiter.current = createHashLimiter({ maxConcurrent: 1, maxQueue: 2, timeoutMs: 2_000 });

    let release: () => void = () => undefined;
    const held = h.limiter.current.run(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const blocked = h.app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: boss.cookie },
      payload: { displayName: '等一等', email: 'wait@example.com', initialPassword: password() },
    });

    release();
    await held;

    const response = await blocked;
    expect(response.statusCode).toBe(201);
  });
});
