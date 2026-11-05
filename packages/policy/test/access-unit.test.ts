import { describe, expect, it } from 'vitest';
import type { AppGrant, Identity, OrgSnapshot, UnitScope } from '@company-os/contracts';
import { canAccessUnit, type UnitAccessInput } from '../src/index.js';

/**
 * canAccessUnit 的組織範圍規則（issue #82 第 6 條）。
 *
 * 三種範圍要明確分得開：全部、指定集合、指定集合及其後代。**未給範圍不代表全部** ——
 * 這一條是最容易寫錯、也最危險的一條：寫錯的話，一個忘記填範圍的授權會變成全公司通行。
 *
 * 圖由呼叫者注入（policy 不讀資料庫），所以下面的邊就是測試的「事實」。
 */

const OWNER: Identity = { kind: 'human', id: 'u-owner', role: 'owner', status: 'active' };
const STAFF: Identity = { kind: 'human', id: 'u-staff', role: 'staff', status: 'active' };
const AGENT: Identity = { kind: 'agent', id: 'a-1', status: 'active' };

const INTERNAL_APP = { id: 'sales', exposure: 'internal' as const, enabled: true };

/** root ← brand ← store；root ← other */
const TREE: OrgSnapshot = {
  units: [{ id: 'root' }, { id: 'brand' }, { id: 'store' }, { id: 'other' }],
  edges: [
    { parentId: 'root', childId: 'brand' },
    { parentId: 'brand', childId: 'store' },
    { parentId: 'root', childId: 'other' },
  ],
};

/** 菱形：d 的兩個上級是 b 與 c，兩者都是 a 的下級。 */
const DIAMOND: OrgSnapshot = {
  units: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [
    { parentId: 'a', childId: 'b' },
    { parentId: 'a', childId: 'c' },
    { parentId: 'b', childId: 'd' },
    { parentId: 'c', childId: 'd' },
  ],
};

const CYCLIC: OrgSnapshot = {
  units: [{ id: 'x' }, { id: 'y' }],
  edges: [
    { parentId: 'y', childId: 'x' },
    { parentId: 'x', childId: 'y' },
  ],
};

function grant(scope: UnitScope | undefined, overrides: Partial<AppGrant> = {}): AppGrant {
  return {
    appId: 'sales',
    subjectId: 'u-staff',
    subjectKind: 'human',
    status: 'active',
    ...(scope === undefined ? {} : { unitScope: scope }),
    ...overrides,
  };
}

function ask(overrides: Partial<UnitAccessInput> = {}): UnitAccessInput {
  return {
    identity: OWNER,
    app: INTERNAL_APP,
    entry: 'internal',
    grants: [],
    targetUnitId: 'store',
    org: TREE,
    ...overrides,
  };
}

describe('先過 app 檢查，再檢查單位', () => {
  it('app 檢查失敗時回 app 的原因，不會偷偷變成範圍問題', () => {
    expect(canAccessUnit(ask({ identity: STAFF, targetUnitId: 'root' }))).toEqual({
      allowed: false,
      reason: 'grant_missing',
    });
  });

  it('入口不對時也是先回入口的原因', () => {
    expect(canAccessUnit(ask({ entry: 'partner' }))).toEqual({
      allowed: false,
      reason: 'entry_not_allowed',
    });
  });
});

describe('老闆與管理員：不受單位範圍限制', () => {
  it('任何存在的單位都允許，不需要授權', () => {
    for (const targetUnitId of ['root', 'brand', 'store', 'other']) {
      expect(canAccessUnit(ask({ targetUnitId }))).toEqual({ allowed: true, via: 'owner' });
    }
  });
});

describe('指定集合（units）', () => {
  it('集合內的單位允許，集合外的拒絕', () => {
    const grants = [grant({ kind: 'units', unitIds: ['store'] })];

    expect(canAccessUnit(ask({ identity: STAFF, grants }))).toEqual({ allowed: true, via: 'grant' });
    expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'brand' }))).toEqual({
      allowed: false,
      reason: 'unit_out_of_scope',
    });
  });

  it('指定集合不含後代：brand 在集合內，store 仍然拒絕', () => {
    const grants = [grant({ kind: 'units', unitIds: ['brand'] })];

    expect(
      canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'store' })),
    ).toEqual({ allowed: false, reason: 'unit_out_of_scope' });
  });
});

describe('指定單位及其後代（subtree）', () => {
  it('自己與後代都允許', () => {
    const grants = [grant({ kind: 'subtree', unitIds: ['brand'] })];

    expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'brand' }))).toEqual({
      allowed: true,
      via: 'grant',
    });
    expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'store' }))).toEqual({
      allowed: true,
      via: 'grant',
    });
  });

  it('同層的另一支不算後代', () => {
    const grants = [grant({ kind: 'subtree', unitIds: ['brand'] })];

    expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'other' }))).toEqual({
      allowed: false,
      reason: 'unit_out_of_scope',
    });
  });

  it('菱形圖：同一個祖先經兩條路都到，仍然只算一次、不會被當成循環', () => {
    const grants = [grant({ kind: 'subtree', unitIds: ['a'] })];

    expect(
      canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'd', org: DIAMOND })),
    ).toEqual({ allowed: true, via: 'grant' });
  });
});

describe('全部（all）', () => {
  it('任何存在的單位都允許', () => {
    const grants = [grant({ kind: 'all' })];

    for (const targetUnitId of ['root', 'brand', 'store', 'other']) {
      expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId }))).toEqual({
        allowed: true,
        via: 'grant',
      });
    }
  });
});

describe('範圍本身有問題：拒絕，不要當成全部', () => {
  it('沒有給範圍：scope_missing（未給不代表全部）', () => {
    expect(canAccessUnit(ask({ identity: STAFF, grants: [grant(undefined)] }))).toEqual({
      allowed: false,
      reason: 'scope_missing',
    });
  });

  it('範圍的 kind 不認得：scope_invalid', () => {
    const grants = [grant({ kind: 'everything', unitIds: [] } as unknown as UnitScope)];

    expect(canAccessUnit(ask({ identity: STAFF, grants }))).toEqual({
      allowed: false,
      reason: 'scope_invalid',
    });
  });

  it('空的單位集合：scope_invalid（一個空集合不等於全部，也不等於「剛好沒有」）', () => {
    for (const kind of ['units', 'subtree'] as const) {
      expect(
        canAccessUnit(ask({ identity: STAFF, grants: [grant({ kind, unitIds: [] })] })),
      ).toEqual({ allowed: false, reason: 'scope_invalid' });
    }
  });

  it('範圍裡的單位 id 是空的：scope_invalid', () => {
    expect(
      canAccessUnit(ask({ identity: STAFF, grants: [grant({ kind: 'units', unitIds: [''] })] })),
    ).toEqual({ allowed: false, reason: 'scope_invalid' });
  });
});

describe('目標單位本身有問題', () => {
  it('不存在的單位：unit_not_found', () => {
    expect(canAccessUnit(ask({ targetUnitId: 'ghost' }))).toEqual({
      allowed: false,
      reason: 'unit_not_found',
    });
  });

  it('已刪除的單位：unit_deleted（連老闆都不行）', () => {
    const org: OrgSnapshot = {
      units: [{ id: 'root' }, { id: 'gone', deleted: true }],
      edges: [{ parentId: 'root', childId: 'gone' }],
    };

    expect(canAccessUnit(ask({ targetUnitId: 'gone', org }))).toEqual({
      allowed: false,
      reason: 'unit_deleted',
    });
  });

  it('目標單位 id 不是字串：input_invalid', () => {
    expect(canAccessUnit(ask({ targetUnitId: 42 as unknown as string }))).toEqual({
      allowed: false,
      reason: 'input_invalid',
    });
  });

  it('組織圖的邊指向不存在的單位：input_invalid（不靜靜忽略）', () => {
    const org: OrgSnapshot = {
      units: [{ id: 'root' }],
      edges: [{ parentId: 'root', childId: 'missing' }],
    };

    expect(canAccessUnit(ask({ org }))).toEqual({ allowed: false, reason: 'input_invalid' });
  });
});

describe('循環圖：拒絕，不無限遞迴', () => {
  it('subtree 範圍遇到循環：graph_cycle', () => {
    const grants = [grant({ kind: 'subtree', unitIds: ['x'] })];

    expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'y', org: CYCLIC }))).toEqual({
      allowed: false,
      reason: 'graph_cycle',
    });
  });

  it('就算是「全部」範圍，循環圖一樣拒絕（圖壞了就不應該放行）', () => {
    const grants = [grant({ kind: 'all' })];

    expect(canAccessUnit(ask({ identity: STAFF, grants, targetUnitId: 'x', org: CYCLIC }))).toEqual({
      allowed: false,
      reason: 'graph_cycle',
    });
  });
});

describe('Agent 的單位範圍', () => {
  it('在範圍內允許、範圍外拒絕', () => {
    const grants = [
      grant({ kind: 'subtree', unitIds: ['brand'] }, { subjectId: 'a-1', subjectKind: 'agent' }),
    ];

    expect(
      canAccessUnit(ask({ identity: AGENT, grants, targetUnitId: 'store' })),
    ).toEqual({ allowed: true, via: 'grant' });

    expect(
      canAccessUnit(ask({ identity: AGENT, grants, targetUnitId: 'other' })),
    ).toEqual({ allowed: false, reason: 'unit_out_of_scope' });
  });

  it('agent 沒有範圍：canAccessApp 已經拒絕，這裡也一樣', () => {
    const grants = [grant(undefined, { subjectId: 'a-1', subjectKind: 'agent' })];

    expect(canAccessUnit(ask({ identity: AGENT, grants }))).toEqual({
      allowed: false,
      reason: 'grant_scope_missing',
    });
  });
});

describe('關閉部門隔離不能繞過任何檢查', () => {
  it('多帶一個 departmentIsolation: false 不會令沒有授權的員工過關', () => {
    const decision = canAccessUnit(
      ask({ identity: STAFF, departmentIsolation: false } as unknown as UnitAccessInput),
    );

    expect(decision).toEqual({ allowed: false, reason: 'grant_missing' });
  });

  it('多帶 departmentIsolation: false 也不會令範圍外的單位過關', () => {
    const decision = canAccessUnit(
      ask({
        identity: STAFF,
        grants: [grant({ kind: 'units', unitIds: ['store'] })],
        targetUnitId: 'other',
        departmentIsolation: false,
      } as unknown as UnitAccessInput),
    );

    expect(decision).toEqual({ allowed: false, reason: 'unit_out_of_scope' });
  });
});
