import { describe, expect, it } from 'vitest';
import {
  canApprove,
  canModify,
  canReject,
  canRequest,
  canRevoke,
  type Actor,
  type GrantLike,
} from '../../src/grants/permissions';

/**
 * 誰可以對授權做什麼（issue #83 的授權規則 2 至 5）。
 *
 * 這裡全部是純函數：不查資料庫、不看時鐘。呼叫者要先讀好「這個人管理哪些 app、
 * 每個 app 可以管到哪些單位」，再交給這幾個函數判斷。
 */

const owner: Actor = { id: 'u-owner', isOwner: true, adminOf: new Map() };

function admin(id: string, appId: string, units: string[]): Actor {
  return { id, isOwner: false, adminOf: new Map([[appId, new Set(units)]]) };
}

function staff(id: string): Actor {
  return { id, isOwner: false, adminOf: new Map() };
}

function grant(over: Partial<GrantLike> = {}): GrantLike {
  return {
    userId: 'u-staff',
    appId: 'sales',
    role: 'member',
    state: 'requested',
    scope: { kind: 'units', unitIds: ['hk'] },
    ...over,
  };
}

const inScope = new Set(['hk']);
const tooWide = new Set(['hk', 'jp']);

describe('canRequest：申請', () => {
  it('老闆可以申請任何 app、任何角色、任何範圍', () => {
    expect(
      canRequest(owner, {
        appId: 'hr',
        subjectId: 'u-staff',
        role: 'app_admin',
        scope: { kind: 'all' },
        scopeCover: new Set(['hk', 'jp']),
      }),
    ).toEqual({ ok: true });
  });

  it('普通員工不可以申請（沒有該 app 的管理權）', () => {
    const decision = canRequest(staff('u-staff'), {
      appId: 'sales',
      subjectId: 'u-other',
      role: 'member',
      scope: { kind: 'units', unitIds: ['hk'] },
      scopeCover: inScope,
    });

    expect(decision.ok).toBe(false);
    expect(decision).toMatchObject({ code: 'not_app_admin' });
  });

  it('app 管理員可以為別人申請自己管理得到的範圍', () => {
    expect(
      canRequest(admin('u-admin', 'sales', ['hk']), {
        appId: 'sales',
        subjectId: 'u-other',
        role: 'member',
        scope: { kind: 'units', unitIds: ['hk'] },
        scopeCover: inScope,
      }),
    ).toEqual({ ok: true });
  });

  it('app 管理員不可以管理自己沒有管理權的 app', () => {
    const decision = canRequest(admin('u-admin', 'sales', ['hk']), {
      appId: 'hr',
      subjectId: 'u-other',
      role: 'member',
      scope: { kind: 'units', unitIds: ['hk'] },
      scopeCover: inScope,
    });

    expect(decision).toMatchObject({ ok: false, code: 'not_app_admin' });
  });

  it('不可以授予超出自己可管理的組織範圍', () => {
    const decision = canRequest(admin('u-admin', 'sales', ['hk']), {
      appId: 'sales',
      subjectId: 'u-other',
      role: 'member',
      scope: { kind: 'units', unitIds: ['hk', 'jp'] },
      scopeCover: tooWide,
    });

    expect(decision).toMatchObject({ ok: false, code: 'scope_exceeds_own' });
  });

  it('為自己申請在申請這一步是准的 —— 擋在批准那一步', () => {
    expect(
      canRequest(admin('u-admin', 'sales', ['hk']), {
        appId: 'sales',
        subjectId: 'u-admin',
        role: 'member',
        scope: { kind: 'units', unitIds: ['hk'] },
        scopeCover: inScope,
      }),
    ).toEqual({ ok: true });
  });
});

describe('canApprove：批准', () => {
  it('敏感 app 只有老闆可以批准', () => {
    const decision = canApprove(admin('u-admin', 'sales', ['hk']), grant(), { sensitive: true });

    expect(decision).toMatchObject({ ok: false, code: 'sensitive_requires_owner' });
  });

  it('敏感 app 老闆可以批准', () => {
    expect(canApprove(owner, grant({ appId: 'hr' }), { sensitive: true })).toEqual({ ok: true });
  });

  it('非敏感 app 的管理員可以批准成員授權', () => {
    expect(canApprove(admin('u-admin', 'sales', ['hk']), grant(), { sensitive: false })).toEqual({
      ok: true,
    });
  });

  it('非 owner 不可以批准自己的新授權', () => {
    const decision = canApprove(
      admin('u-admin', 'sales', ['hk']),
      grant({ userId: 'u-admin' }),
      { sensitive: false },
    );

    expect(decision).toMatchObject({ ok: false, code: 'self_approval' });
  });

  it('老闆批准自己的申請可以（老闆的權限不靠授權）', () => {
    expect(canApprove(owner, grant({ userId: 'u-owner' }), { sensitive: false })).toEqual({
      ok: true,
    });
  });

  it('批准時仍然不可以超出自己的範圍', () => {
    const decision = canApprove(
      admin('u-admin', 'sales', ['hk']),
      grant({ scope: { kind: 'units', unitIds: ['hk', 'jp'] } }),
      { sensitive: false },
    );

    expect(decision).toMatchObject({ ok: false, code: 'scope_exceeds_own' });
  });

  it('沒有該 app 管理權的人不可以批准', () => {
    const decision = canApprove(staff('u-staff'), grant(), { sensitive: false });

    expect(decision).toMatchObject({ ok: false, code: 'not_app_admin' });
  });

  it('已經生效的授權不可以再批准一次', () => {
    const decision = canApprove(owner, grant({ state: 'active' }), { sensitive: false });

    expect(decision).toMatchObject({ ok: false, code: 'invalid_transition' });
  });

  it('已撤銷或已拒絕的授權不可以復活', () => {
    expect(canApprove(owner, grant({ state: 'revoked' }), { sensitive: false })).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
    expect(canApprove(owner, grant({ state: 'rejected' }), { sensitive: false })).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
  });

  it('app_admin 角色的授予，非敏感 app 的管理員可以批准（給別人）', () => {
    expect(
      canApprove(admin('u-admin', 'sales', ['hk']), grant({ role: 'app_admin' }), {
        sensitive: false,
      }),
    ).toEqual({ ok: true });
  });

  it('app_admin 角色的授予，敏感 app 仍然要老闆', () => {
    expect(
      canApprove(admin('u-admin', 'sales', ['hk']), grant({ role: 'app_admin' }), {
        sensitive: true,
      }),
    ).toMatchObject({ ok: false, code: 'sensitive_requires_owner' });
  });
});

describe('canReject：拒絕', () => {
  it('管理員可以拒絕自己管理 app 的申請（敏感 app 也可以 —— 拒絕等於不給）', () => {
    expect(canReject(admin('u-admin', 'sales', ['hk']), grant())).toEqual({ ok: true });
  });

  it('沒有管理權的人不可以拒絕', () => {
    expect(canReject(staff('u-staff'), grant())).toMatchObject({ ok: false, code: 'not_app_admin' });
  });

  it('已生效的授權要用撤銷，不是拒絕', () => {
    expect(canReject(owner, grant({ state: 'active' }))).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
  });
});

describe('canRevoke：撤銷', () => {
  it('老闆可以撤銷任何生效中的授權', () => {
    expect(canRevoke(owner, grant({ state: 'active' }))).toEqual({ ok: true });
  });

  it('管理員可以撤銷自己管理 app 的授權', () => {
    expect(canRevoke(admin('u-admin', 'sales', ['hk']), grant({ state: 'active' }))).toEqual({
      ok: true,
    });
  });

  it('普通員工不可以撤銷（撤銷仍然要管理權）', () => {
    expect(canRevoke(staff('u-staff'), grant({ state: 'active' }))).toMatchObject({
      ok: false,
      code: 'not_app_admin',
    });
  });

  it('已經撤銷的不可以再撤銷一次', () => {
    expect(canRevoke(owner, grant({ state: 'revoked' }))).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
  });
});

describe('canModify：改範圍或改角色', () => {
  it('管理員不可以改自己的授權（自我擴權）', () => {
    const decision = canModify(
      admin('u-admin', 'sales', ['hk']),
      grant({ userId: 'u-admin', state: 'active' }),
    );

    expect(decision).toMatchObject({ ok: false, code: 'self_escalation' });
  });

  it('管理員可以為別人建立新版本（新範圍在自己的範圍內）', () => {
    expect(canModify(admin('u-admin', 'sales', ['hk']), grant({ state: 'active' }))).toEqual({
      ok: true,
    });
  });

  it('改動之後的新範圍超出自己範圍 → 拒絕', () => {
    const decision = canModify(
      admin('u-admin', 'sales', ['hk']),
      grant({ state: 'active', scope: { kind: 'units', unitIds: ['hk', 'jp'] } }),
    );

    expect(decision).toMatchObject({ ok: false, code: 'scope_exceeds_own' });
  });

  it('已結束的授權不可以再改', () => {
    expect(canModify(owner, grant({ state: 'revoked' }))).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
  });

  it('敏感 app 的擴範圍由管理員建立新版本是准的 —— 批准那一步才要老闆', () => {
    // 敏感度不是「申請」的閘門，是「批准」的閘門（規則 3 講的是批准）。
    expect(canModify(admin('u-admin', 'sales', ['hk']), grant({ state: 'active' }))).toEqual({
      ok: true,
    });
  });
});
