import { useEffect, useState } from 'react';

/**
 * 登入守衛。
 *
 * 守衛只做一件判斷：由伺服器給的 `auth/state` 決定要顯示哪一個畫面。
 * 前端不記「有沒有老闆」——誰先呼叫 setup 誰就是老闆，這件事只有伺服器知道。
 *
 * 登入狀態由呼叫端**注入**（`loadState`）：app-shell 不認識任何 API client、
 * 不讀 cookie、不建立第二份身份真相。之後接 platform-kit 時只需換掉注入的函數。
 */

/** 守衛需要的最小使用者資料；不含任何 session 或 token。 */
export type ShellUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export type AuthSnapshot<U extends ShellUser = ShellUser> = {
  setupRequired: boolean;
  signedIn: boolean;
  user?: U;
};

export type AuthLoad<U extends ShellUser = ShellUser> =
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'ready'; auth: AuthSnapshot<U> };

export type Screen = 'loading' | 'unreachable' | 'setup' | 'login' | 'home';

/** 純函數：狀態 → 畫面。抽出來是為了可以單獨測試，不用渲染。 */
export function screenOf(state: AuthLoad<ShellUser>): Screen {
  if (state.kind === 'loading') {
    return 'loading';
  }

  if (state.kind === 'unreachable') {
    return 'unreachable';
  }

  if (state.auth.signedIn && state.auth.user !== undefined) {
    return 'home';
  }

  return state.auth.setupRequired ? 'setup' : 'login';
}

/**
 * 守衛 hook：載入、失敗（連不到）、就緒三態，另有 retry。
 *
 * `loadState` 回傳 null 代表「連不到」：網絡錯誤與 5xx 都算，畫面要說真話，
 * 不顯示空白頁，也不假裝未開機。
 */
export function useAuthGate<U extends ShellUser>(
  loadState: () => Promise<AuthSnapshot<U> | null>,
): {
  state: AuthLoad<U>;
  retry: () => void;
} {
  const [state, setState] = useState<AuthLoad<U>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setState({ kind: 'loading' });

    void loadState().then((auth) => {
      if (cancelled) {
        return;
      }

      if (auth === null) {
        setState({ kind: 'unreachable' });
        return;
      }

      setState({ kind: 'ready', auth });
    });

    return () => {
      cancelled = true;
    };
  }, [loadState, attempt]);

  return { state, retry: () => setAttempt((current) => current + 1) };
}
