import { useCallback, useEffect, useState } from 'react';
import {
  ConnectionErrorScreen,
  LoadingScreen,
  screenOf,
  useAuthGate,
  type AuthLoad,
  type AuthSnapshot,
} from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { fetchAuthState, type PublicUser } from './api';
import { navigate, useRoute } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SetupScreen } from './screens/SetupScreen';
import { WorkspacePrototype } from './prototype/WorkspacePrototype';

/**
 * 外殼的第一層：開機問一次 API，由答案決定畫面。
 *
 * 「該顯示哪一個畫面」與「載入／連不到」的狀態機已搬去 app-shell（#73 R3）。
 * 這裡只保留這個 app 自己的事：怎麼問 API、網址怎樣對齊、以及三個轉場
 * （登入、登出、已經設定過）之後要變成什麼狀態。
 *
 * 前端不自己記「有沒有老闆」：`setupRequired` 每次都問 `/api/auth/state`，
 * 因為誰先呼叫 setup 誰就是老闆，這件事只有伺服器知道。
 */

const ROUTE_OF: Record<'setup' | 'login' | 'home', '/' | '/login' | '/setup'> = {
  setup: '/setup',
  login: '/login',
  home: '/',
};

export function App() {
  /**
   * 把 API 的結果翻譯成守衛認得的形狀：連不到（網絡錯誤或 5xx）回 null。
   * 必須包在 useCallback：守衛以它做 effect 的依賴，每次 render 換一個函數
   * 就會無限重載。
   */
  const loadState = useCallback(async (): Promise<AuthSnapshot<PublicUser> | null> => {
    const result = await fetchAuthState();

    return result.ok ? result.data : null;
  }, []);

  const { state, retry } = useAuthGate(loadState);

  /** 登入／登出／已經設定過之後的本地狀態；null 代表「照伺服器最初的答案」。 */
  const [override, setOverride] = useState<AuthSnapshot<PublicUser> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const route = useRoute();
  const effective: AuthLoad<PublicUser> = override === null ? state : { kind: 'ready', auth: override };
  const screen = screenOf(effective);

  // 網址只是畫面的鏡子：畫面定了就把 hash 對齊，重新載入仍然停在同一個地方。
  // 比對原始 hash 而不是解析後的 route，空 hash 也要補成 #/。
  // `/app/*` 例外：那一頁的深連結由該頁自己擁有（決策 C48），這裡不可以蓋掉它。
  useEffect(() => {
    if (screen !== 'setup' && screen !== 'login' && screen !== 'home') {
      return;
    }

    if (screen === 'home' && route === '/app') {
      return;
    }

    const target = ROUTE_OF[screen];

    if (window.location.hash !== `#${target}`) {
      navigate(target);
    }
  }, [screen, route]);

  function signedIn(user: PublicUser): void {
    setNotice(null);
    setOverride({ setupRequired: false, signedIn: true, user });
  }

  function signedOut(): void {
    setNotice(null);
    setOverride({ setupRequired: false, signedIn: false });
  }

  function alreadySetUp(): void {
    setNotice(t('login.noticeAlreadySetUp'));
    setOverride({ setupRequired: false, signedIn: false });
  }

  if (screen === 'loading') {
    return <LoadingScreen />;
  }

  if (screen === 'unreachable') {
    return <ConnectionErrorScreen onRetry={retry} />;
  }

  if (effective.kind !== 'ready') {
    return <LoadingScreen />;
  }

  if (screen === 'home' && effective.auth.user !== undefined) {
    // `/app/*` 是原型外殼（issue 118 切片 C）。它標明是原型資料，不是正式 registry 的 app。
    if (route === '/app') {
      return <WorkspacePrototype />;
    }

    return <HomeScreen user={effective.auth.user} onSignedOut={signedOut} />;
  }

  if (screen === 'setup') {
    return <SetupScreen onCreated={signedIn} onAlreadySetUp={alreadySetUp} />;
  }

  return <LoginScreen notice={notice} onSignedIn={signedIn} />;
}
