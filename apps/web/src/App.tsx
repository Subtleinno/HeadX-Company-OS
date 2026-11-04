import { useEffect, useState } from 'react';
import { fetchAuthState, type AuthState, type PublicUser } from './api';
import { navigate, useRoute } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SetupScreen } from './screens/SetupScreen';
import { ConnectionErrorScreen, LoadingScreen } from './screens/StatusScreens';

/**
 * 外殼的第一層：開機問一次 API，由答案決定畫面。
 *
 * 前端不自己記「有沒有老闆」：`setupRequired` 每次都問 `/api/auth/state`，
 * 因為誰先呼叫 setup 誰就是老闆，這件事只有伺服器知道。
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'ready'; auth: AuthState };

type Screen = 'loading' | 'unreachable' | 'setup' | 'login' | 'home';

const ROUTE_OF: Record<'setup' | 'login' | 'home', '/' | '/login' | '/setup'> = {
  setup: '/setup',
  login: '/login',
  home: '/',
};

function screenOf(load: LoadState): Screen {
  if (load.kind === 'loading') {
    return 'loading';
  }

  if (load.kind === 'unreachable') {
    return 'unreachable';
  }

  if (load.auth.signedIn && load.auth.user !== undefined) {
    return 'home';
  }

  return load.auth.setupRequired ? 'setup' : 'login';
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const route = useRoute();
  const screen = screenOf(load);

  useEffect(() => {
    let cancelled = false;

    setLoad({ kind: 'loading' });

    void fetchAuthState().then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setLoad({ kind: 'ready', auth: result.data });
        return;
      }

      // 網絡錯誤與 5xx 都是「連不到」；不顯示空白頁，也不假裝未開機。
      setLoad({ kind: 'unreachable' });
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // 網址只是畫面的鏡子：畫面定了就把 hash 對齊，重新載入仍然停在同一個地方。
  // 比對原始 hash 而不是解析後的 route，空 hash 也要補成 #/。
  useEffect(() => {
    if (screen !== 'setup' && screen !== 'login' && screen !== 'home') {
      return;
    }

    const target = ROUTE_OF[screen];

    if (window.location.hash !== `#${target}`) {
      navigate(target);
    }
  }, [screen, route]);

  function signedIn(user: PublicUser): void {
    setNotice(null);
    setLoad({ kind: 'ready', auth: { setupRequired: false, signedIn: true, user } });
  }

  function signedOut(): void {
    setNotice(null);
    setLoad({ kind: 'ready', auth: { setupRequired: false, signedIn: false } });
  }

  function alreadySetUp(): void {
    setNotice('已經有老闆帳戶，請登入。');
    setLoad({ kind: 'ready', auth: { setupRequired: false, signedIn: false } });
  }

  if (screen === 'loading') {
    return <LoadingScreen />;
  }

  if (screen === 'unreachable') {
    return <ConnectionErrorScreen onRetry={() => setAttempt((current) => current + 1)} />;
  }

  if (load.kind !== 'ready') {
    return <LoadingScreen />;
  }

  if (screen === 'home' && load.auth.user !== undefined) {
    return <HomeScreen user={load.auth.user} onSignedOut={signedOut} />;
  }

  if (screen === 'setup') {
    return <SetupScreen onCreated={signedIn} onAlreadySetUp={alreadySetUp} />;
  }

  return <LoginScreen notice={notice} onSignedIn={signedIn} />;
}
