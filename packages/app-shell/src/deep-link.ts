/**
 * 深連結（決策 C48）與切換矩陣（WORKSPACE 第 6、7 節）。
 *
 * 呢兩個都係純函數，刻意唔碰 DOM、唔碰 fetch、唔碰 React：
 *
 * - 深連結只表達「app、工作範圍、頁面」嘅導航狀態。它唔代表授權，亦唔會繞過
 *   `requireUser`、entry 判斷、policy engine 或 manifest registry —— 解析成功
 *   只等於「呢串字講得出一個位置」，唔等於「你可以去」。
 * - 切換矩陣只決定「切去目標 app 之後，範圍應該係咩，或者要先問用家揀」。
 *   它唔會建立、複製、收窄、擴大或撤銷任何授權（C46）。
 *
 * 格式（C48 允許按 router 現況收斂，實際值記錄在 PR）：
 *
 *   #/app/<appId>
 *   #/app/<appId>/company
 *   #/app/<appId>/brand.<brandId>
 *   #/app/<appId>/<scope>/<page>
 *
 * 冇範圍就冇頁面：`null` 範圍唔可以編碼成一個頁面路徑，否則「未選品牌」會被
 * 靜靜讀成「公司」。呢個係 C43 明令禁止嘅事。
 */

import type { PrototypeApp, ScopeTarget } from './workspace.js';

export const SHELL_PATH_ROOT = '/app';

const APP_ID = /^[a-z][a-z0-9_]*$/;
const PAGE_KEY = /^[a-z0-9][a-z0-9-]*$/;
const BRAND_SCOPE = /^brand\.([a-z][a-z0-9_]*)$/;

export type ParsedShellHash =
  | { kind: 'none' }
  | { kind: 'app'; appId: string; scope: ScopeTarget | null; page: string | null }
  | { kind: 'invalid'; segment: string; reason: string };

export function parseShellHash(hash: string): ParsedShellHash {
  const raw = hash.replace(/^#/, '');

  if (raw === '' || raw === '/') {
    return { kind: 'none' };
  }

  const segments = raw.replace(/^\/+|\/+$/g, '').split('/');

  if (segments[0] !== 'app') {
    return { kind: 'none' };
  }

  if (segments.length < 2 || segments.length > 4) {
    return { kind: 'invalid', segment: raw, reason: 'bad_segment_count' };
  }

  const appId = segments[1] ?? '';

  if (!APP_ID.test(appId)) {
    return { kind: 'invalid', segment: appId, reason: 'bad_app_id' };
  }

  const scopeSegment = segments[2];
  const pageSegment = segments[3];

  if (pageSegment !== undefined && scopeSegment === undefined) {
    return { kind: 'invalid', segment: raw, reason: 'page_without_scope' };
  }

  let scope: ScopeTarget | null = null;

  if (scopeSegment !== undefined) {
    if (scopeSegment === 'company') {
      scope = { kind: 'company' };
    } else {
      const brand = BRAND_SCOPE.exec(scopeSegment);

      if (brand === null) {
        return { kind: 'invalid', segment: scopeSegment, reason: 'bad_scope' };
      }

      scope = { kind: 'brand', brandId: brand[1] as string };
    }
  }

  let page: string | null = null;

  if (pageSegment !== undefined) {
    if (!PAGE_KEY.test(pageSegment)) {
      return { kind: 'invalid', segment: pageSegment, reason: 'bad_page' };
    }

    page = pageSegment;
  }

  return { kind: 'app', appId, scope, page };
}

/** 冇範圍就冇頁面：範圍係 null 時，頁面會被丟棄而不是偽造一個公司範圍。 */
export function buildShellHash(input: {
  appId: string;
  scope: ScopeTarget | null;
  page: string | null;
}): string {
  const base = `#${SHELL_PATH_ROOT}/${input.appId}`;

  if (input.scope === null) {
    return base;
  }

  const segment = input.scope.kind === 'company' ? 'company' : `brand.${input.scope.brandId}`;

  if (input.page === null) {
    return `${base}/${segment}`;
  }

  return `${base}/${segment}/${input.page}`;
}

export type SwitchPlan =
  | { kind: 'ready'; scope: ScopeTarget }
  | { kind: 'needs-scope'; appId: string };

/**
 * 切 app 之後範圍應該係咩（WORKSPACE 第 6 節的矩陣）。
 *
 * 公司型一定回到公司範圍；品牌型如果目前的品牌仍然合法就保留，否則要先問；
 * 混合型保留目前範圍（公司或品牌都合法），未選範圍就要問。
 *
 * 「保留」係指同一個目標繼續，唔係複製或重新歸屬任何資料。
 */
export function planAppSwitch(input: {
  target: PrototypeApp;
  currentScope: ScopeTarget | null;
  availableBrandIds: readonly string[];
}): SwitchPlan {
  const { target, currentScope, availableBrandIds } = input;

  if (target.mode === 'company') {
    return { kind: 'ready', scope: { kind: 'company' } };
  }

  const currentBrandIsUsable =
    currentScope !== null &&
    currentScope.kind === 'brand' &&
    availableBrandIds.includes(currentScope.brandId);

  if (target.mode === 'brand') {
    if (currentBrandIsUsable && currentScope !== null) {
      return { kind: 'ready', scope: currentScope };
    }

    return { kind: 'needs-scope', appId: target.id };
  }

  // 混合型：公司與品牌都是合法入口，所以目前範圍可以直接保留。
  if (currentScope === null) {
    return { kind: 'needs-scope', appId: target.id };
  }

  if (currentScope.kind === 'company') {
    return { kind: 'ready', scope: { kind: 'company' } };
  }

  return currentBrandIsUsable ? { kind: 'ready', scope: currentScope } : { kind: 'needs-scope', appId: target.id };
}

/** 某個範圍係唔係可以喺某個 app 使用。第二步入面用同一條規則，避免兩套判斷。 */
export function isScopeAllowed(input: {
  app: PrototypeApp;
  scope: ScopeTarget;
  availableBrandIds: readonly string[];
}): boolean {
  const { app, scope, availableBrandIds } = input;

  if (app.mode === 'company') {
    return scope.kind === 'company';
  }

  if (scope.kind === 'company') {
    return app.mode === 'mixed';
  }

  return availableBrandIds.includes(scope.brandId);
}

/** 切換範圍時要唔要換頁：品牌型與混合型換品牌都返 app 入口，唔會停在同名頁面。 */
export function pageAfterScopeChange(): string | null {
  return null;
}
