import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  checkAppAccess,
  fetchModules,
  type AccessDecision,
  type ApiFailure,
  type PublicModule,
} from '../api';

/**
 * F-03（issue 160）：app 清單與存取判斷嘅唯一讀取點。
 *
 * App selector 同「我的 Apps」共用呢一個 hook 嘅結果，成頁只讀一次
 * `GET /modules`，再逐個 app 問一次 `GET /app-grants/access/:appId`。
 * 由原本 `MyApps` 嘅分類同序號守衛搬過來，唔簡化：
 *
 *   - 載入中、有資料、空清單（ready 而 modules 係空）、401、403 改密碼、
 *     其他 403、讀取失敗（可重試）全部如實分開。
 *   - 存取判斷「允許」「不允許加原因」「查不到」三者分開；查唔到唔可以
 *     當成允許，亦唔可以當成不允許。
 *   - 舊回應唔可以覆蓋新一輪：每次重讀換一個序號。
 *
 * app 清單只有一個來源（manifest 經 `/modules`），身份由 `GET /me`（喺
 * 個別畫面）負責；前端唔存副本、唔用示意值、唔用 localStorage。
 */

export type AppListState =
  | { kind: 'loading' }
  | { kind: 'ready'; modules: PublicModule[] }
  | { kind: 'denied'; status: number }
  | { kind: 'passwordChange' }
  | { kind: 'failed'; reasons: string[] };

export type AppAccessState =
  | { kind: 'checking' }
  | { kind: 'allowed'; via: 'owner' | 'grant' }
  | { kind: 'denied'; reason: string }
  | { kind: 'unknown'; detail: string };

export type AppListView = {
  list: AppListState;
  access: Record<string, AppAccessState>;
  reload: () => void;
};

function reasonsOf(failure: ApiFailure, fallback: string): string[] {
  if (failure.kind === 'network') {
    return [t('error.network')];
  }

  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  if (failure.message !== null) {
    return [failure.message];
  }

  return [failure.error === null ? fallback : `${fallback}（${failure.error}）`];
}

function detailOf(failure: ApiFailure): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  return failure.error ?? `HTTP ${failure.status}`;
}

/**
 * 只認「403 + error 代碼」呢個組合（issue 140 第 4 項）。
 * 唔可以只憑 403 就當成要改密碼，亦唔可以用 message／reasons 入面嘅字眼猜。
 */
function isPasswordChangeRequired(failure: ApiFailure): boolean {
  return (
    failure.kind === 'http' && failure.status === 403 && failure.error === 'password_change_required'
  );
}

/** 一次過問每個 app 嘅存取，但保留「查不到」與「不允許」嘅分別。 */
async function decide(modules: readonly PublicModule[]): Promise<Record<string, AppAccessState>> {
  const results = await Promise.all(
    modules.map(async (module): Promise<[string, AppAccessState]> => {
      const result = await checkAppAccess(module.id);

      if (result.ok) {
        const decision: AccessDecision = result.data;

        return [
          module.id,
          decision.allowed
            ? { kind: 'allowed', via: decision.via }
            : { kind: 'denied', reason: decision.reason },
        ];
      }

      return [module.id, { kind: 'unknown', detail: detailOf(result.failure) }];
    }),
  );

  return Object.fromEntries(results);
}

/**
 * `enabled` 為 false 時完全唔讀 `/modules`（例如首次強制改密碼嘅個人帳戶頁，
 * 後端喺嗰個狀態一律 403，唔應該去問，亦唔應該顯示成「沒有權限」）。
 */
export function useAppList(enabled: boolean, includeAccess = true): AppListView {
  const [list, setList] = useState<AppListState>({ kind: 'loading' });
  const [access, setAccess] = useState<Record<string, AppAccessState>>({});

  /** 舊回應唔可以覆蓋新一輪：每重讀一次就換一個號碼。 */
  const seq = useRef(0);
  /** 同一個 hook 實例只喺第一次掛載讀一次；StrictMode 嘅第二次 effect 唔好再讀。 */
  const started = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    const mine = seq.current + 1;
    seq.current = mine;

    setList({ kind: 'loading' });
    setAccess({});

    const result = await fetchModules();

    if (mine !== seq.current) {
      return;
    }

    if (!result.ok) {
      if (isPasswordChangeRequired(result.failure)) {
        setList({ kind: 'passwordChange' });

        return;
      }

      if (
        result.failure.kind === 'http' &&
        (result.failure.status === 401 || result.failure.status === 403)
      ) {
        setList({ kind: 'denied', status: result.failure.status });

        return;
      }

      setList({ kind: 'failed', reasons: reasonsOf(result.failure, t('myapps.failed')) });

      return;
    }

    const modules = result.data.modules;

    setList({ kind: 'ready', modules });

    // selector 只需要 app 清單；逐個 app 嘅存取判斷留畀有「我的 Apps」嘅畫面，
    // 唔喺其他畫面重複問同一批 access 請求。
    if (!includeAccess) {
      setAccess({});

      return;
    }

    setAccess(
      Object.fromEntries(modules.map((module) => [module.id, { kind: 'checking' as const }])),
    );

    const decided = await decide(modules);

    if (mine !== seq.current) {
      return;
    }

    setAccess(decided);
  }, [includeAccess]);

  useEffect(() => {
    if (!enabled || started.current) {
      return;
    }

    started.current = true;
    void load();
  }, [enabled, load]);

  const reload = useCallback((): void => {
    void load();
  }, [load]);

  return { list, access, reload };
}
