import { describe, expect, it } from 'vitest';
import type { AppGrant, Identity } from '@company-os/contracts';
import { canAccessApp, type AppAccessInput } from '../src/index.js';

/**
 * canAccessApp 的拒絕與允許規則（issue #82）。
 *
 * 每一條拒絕規則都有自己的案例，另外有一批「應該要允許」的案例 ——
 * 一個把所有請求都拒絕的引擎同樣可以令所有拒絕測試通過，所以允許案例是必要的平衡。
 *
 * 這些測試同時是「呼叫者不可以相信 HTTP body」這句話的示範：下面的 identity、
 * entry、grants 都是「由服務端取得的快照」，引擎只判定，不負責驗證 session 或簽章。
 */

const OWNER: Identity = { kind: 'human', id: 'u-owner', role: 'owner', status: 'active' };
const ADMIN: Identity = { kind: 'human', id: 'u-admin', role: 'admin', status: 'active' };
const STAFF: Identity = { kind: 'human', id: 'u-staff', role: 'staff', status: 'active' };
const PARTNER: Identity = { kind: 'human', id: 'u-partner', role: 'partner', status: 'active' };
const AGENT: Identity = { kind: 'agent', id: 'a-1', status: 'active' };

const INTERNAL_APP = { id: 'sales', exposure: 'internal' as const, enabled: true };
const PARTNER_APP = { id: 'dealer', exposure: 'partner' as const, enabled: true };
const CUSTOMER_APP = { id: 'portal', exposure: 'customer' as const, enabled: true };

function grant(overrides: Partial<AppGrant> = {}): AppGrant {
  return {
    appId: 'sales',
    subjectId: 'u-staff',
    subjectKind: 'human',
    status: 'active',
    ...overrides,
  };
}

function input(overrides: Partial<AppAccessInput> = {}): AppAccessInput {
  return {
    identity: OWNER,
    app: INTERNAL_APP,
    entry: 'internal',
    grants: [],
    ...overrides,
  };
}

describe('預設拒絕', () => {
  it('身份形狀不合法：拒絕，原因是 input_invalid', () => {
    for (const identity of [
      null,
      {},
      { kind: 'human', id: '', role: 'owner', status: 'active' },
      { kind: 'human', id: 'u-1', role: 'superuser', status: 'active' },
      { kind: 'robot', id: 'r-1', status: 'active' },
      { kind: 'human', id: 'u-2', role: 'owner' },
    ]) {
      const decision = canAccessApp(input({ identity: identity as unknown as Identity }));

      expect(decision).toEqual({ allowed: false, reason: 'input_invalid' });
    }
  });

  it('客戶身份：明確拒絕且原因可分辨（第 4 條：不預先開放）', () => {
    const decision = canAccessApp(
      input({ identity: { kind: 'customer', id: 'c-1', status: 'active' } as unknown as Identity }),
    );

    expect(decision).toEqual({ allowed: false, reason: 'identity_kind_unsupported' });
  });

  it('身份停用：拒絕', () => {
    const decision = canAccessApp(
      input({ identity: { ...OWNER, status: 'disabled' } as Identity }),
    );

    expect(decision).toEqual({ allowed: false, reason: 'identity_disabled' });
  });

  it('app 未啟用：拒絕', () => {
    const decision = canAccessApp(input({ app: { ...INTERNAL_APP, enabled: false } }));

    expect(decision).toEqual({ allowed: false, reason: 'app_disabled' });
  });

  it('app 的 exposure 不是三種之一：拒絕', () => {
    const decision = canAccessApp(
      input({ app: { ...INTERNAL_APP, exposure: 'public' } as unknown as AppAccessInput['app'] }),
    );

    expect(decision).toEqual({ allowed: false, reason: 'app_exposure_invalid' });
  });

  it('入口不是三種之一：拒絕', () => {
    const decision = canAccessApp(input({ entry: 'internet' as unknown as 'internal' }));

    expect(decision).toEqual({ allowed: false, reason: 'entry_invalid' });
  });

  it('授權清單形狀壞掉：拒絕（不當成「沒有授權」靜靜放行）', () => {
    const decision = canAccessApp(
      input({ grants: [{ appId: 'sales' }] as unknown as AppGrant[] }),
    );

    expect(decision).toEqual({ allowed: false, reason: 'input_invalid' });
  });
});

describe('入口規則（老闆也不能繞過）', () => {
  it('internal app 只接受 internal 入口', () => {
    expect(canAccessApp(input({ entry: 'partner' }))).toEqual({
      allowed: false,
      reason: 'entry_not_allowed',
    });
    expect(canAccessApp(input({ entry: 'customer' }))).toEqual({
      allowed: false,
      reason: 'entry_not_allowed',
    });
    expect(canAccessApp(input({ entry: 'internal' }))).toEqual({ allowed: true, via: 'owner' });
  });

  it('partner app 接受 internal 或 partner 入口，不接受 customer', () => {
    expect(canAccessApp(input({ app: PARTNER_APP, entry: 'internal' }))).toEqual({
      allowed: true,
      via: 'owner',
    });
    expect(canAccessApp(input({ app: PARTNER_APP, entry: 'partner' }))).toEqual({
      allowed: true,
      via: 'owner',
    });
    expect(canAccessApp(input({ app: PARTNER_APP, entry: 'customer' }))).toEqual({
      allowed: false,
      reason: 'entry_not_allowed',
    });
  });

  it('customer app 只接受 customer 入口（由內部入口進不來）', () => {
    expect(canAccessApp(input({ app: CUSTOMER_APP, entry: 'internal' }))).toEqual({
      allowed: false,
      reason: 'entry_not_allowed',
    });
  });

  it('老闆與管理員都一樣受入口限制', () => {
    for (const identity of [OWNER, ADMIN]) {
      expect(canAccessApp(input({ identity, app: INTERNAL_APP, entry: 'partner' }))).toEqual({
        allowed: false,
        reason: 'entry_not_allowed',
      });
    }
  });

  it('版本不開放外部入口：partner／customer 入口一律拒絕，internal 入口照常', () => {
    const capabilities = { externalEntry: false };

    expect(canAccessApp(input({ app: PARTNER_APP, entry: 'partner', capabilities }))).toEqual({
      allowed: false,
      reason: 'entry_disabled',
    });

    // 大陸版的內部員工用「原標為 partner」的 app：照樣進得去。
    expect(canAccessApp(input({ app: PARTNER_APP, entry: 'internal', capabilities }))).toEqual({
      allowed: true,
      via: 'owner',
    });
  });
});

describe('人類身份：老闆不用授權，員工與夥伴要有效授權', () => {
  it('老闆與管理員可以直接存取員工側 app', () => {
    expect(canAccessApp(input({ identity: OWNER }))).toEqual({ allowed: true, via: 'owner' });
    expect(canAccessApp(input({ identity: ADMIN }))).toEqual({ allowed: true, via: 'owner' });
  });

  it('員工有生效授權：允許，via 是 grant', () => {
    const decision = canAccessApp(
      input({ identity: STAFF, grants: [grant({ unitScope: { kind: 'all' } })] }),
    );

    expect(decision).toEqual({ allowed: true, via: 'grant' });
  });

  it('員工沒有授權：拒絕', () => {
    expect(canAccessApp(input({ identity: STAFF }))).toEqual({
      allowed: false,
      reason: 'grant_missing',
    });
  });

  it('申請中、已撤銷、已過期的授權都不算', () => {
    for (const status of ['pending', 'revoked', 'expired'] as const) {
      const decision = canAccessApp(input({ identity: STAFF, grants: [grant({ status })] }));

      expect(decision, status).toEqual({ allowed: false, reason: 'grant_missing' });
    }
  });

  it('授權是給別人的、或給別的 app 的，都不算', () => {
    expect(
      canAccessApp(input({ identity: STAFF, grants: [grant({ subjectId: 'u-other' })] })),
    ).toEqual({ allowed: false, reason: 'grant_missing' });

    expect(
      canAccessApp(input({ identity: STAFF, grants: [grant({ appId: 'other-app' })] })),
    ).toEqual({ allowed: false, reason: 'grant_missing' });
  });

  it('夥伴可以進 partner app（有授權），不能進 internal app', () => {
    expect(
      canAccessApp(
        input({
          identity: PARTNER,
          app: PARTNER_APP,
          entry: 'partner',
          grants: [grant({ appId: 'dealer', subjectId: 'u-partner', unitScope: { kind: 'all' } })],
        }),
      ),
    ).toEqual({ allowed: true, via: 'grant' });

    // 即使有 internal app 的授權，夥伴身份也不可以進去。
    expect(
      canAccessApp(
        input({
          identity: PARTNER,
          grants: [grant({ subjectId: 'u-partner', unitScope: { kind: 'all' } })],
        }),
      ),
    ).toEqual({ allowed: false, reason: 'role_not_permitted' });
  });
});

describe('Agent：預設零權限，必須有明確授權與組織範圍', () => {
  it('沒有授權：拒絕', () => {
    expect(canAccessApp(input({ identity: AGENT }))).toEqual({
      allowed: false,
      reason: 'grant_missing',
    });
  });

  it('有生效授權但沒有組織範圍：拒絕（未給範圍不代表全部）', () => {
    const decision = canAccessApp(
      input({
        identity: AGENT,
        grants: [grant({ subjectId: 'a-1', subjectKind: 'agent' })],
      }),
    );

    expect(decision).toEqual({ allowed: false, reason: 'grant_scope_missing' });
  });

  it('有生效授權與組織範圍：允許', () => {
    const decision = canAccessApp(
      input({
        identity: AGENT,
        grants: [
          grant({
            subjectId: 'a-1',
            subjectKind: 'agent',
            unitScope: { kind: 'units', unitIds: ['unit-1'] },
          }),
        ],
      }),
    );

    expect(decision).toEqual({ allowed: true, via: 'grant' });
  });

  it('人類（老闆）的授權不會自動套用到 agent：主體種類要對得上', () => {
    // 同一組 grants 裡面有一條 active、但 subjectKind 是 human。
    const decision = canAccessApp(
      input({
        identity: AGENT,
        grants: [grant({ subjectId: 'a-1', subjectKind: 'human', unitScope: { kind: 'all' } })],
      }),
    );

    expect(decision).toEqual({ allowed: false, reason: 'grant_missing' });
  });
});
