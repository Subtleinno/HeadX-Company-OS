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
import { AdminArea } from './admin/AdminArea';
import { BossPortal } from './boss/BossPortal';
import { DesignApp } from './design/DesignApp';
import { DepartmentClosedGate, NoDepartmentGate } from './screens/DepartmentGate';
import { useLanding } from './frame/useLanding';
import { AccountScreen } from './screens/AccountScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SetupScreen } from './screens/SetupScreen';
import { FilesScreen } from './screens/FilesScreen';
import { NeedsScreen } from './needs/NeedsScreen';
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
  /**
   * 啱啱完成登入（或首次設定）。
   *
   * 落點只在這一刻生效一次：登入之後直接入自己嘅工作台。之後喺 app 內
   * 行嚟行去、甚至重新載入，都唔會再被拉走 —— 用戶自己撳去邊就係邊。
   * 唔用「網址係 / 就跳」嘅做法，因為咁會令首頁（我的 Apps）永遠去唔到，
   * 亦會令用戶每次按上一頁都被彈走。
   */
  const [justSignedIn, setJustSignedIn] = useState(false);

  const route = useRoute();
  const effective: AuthLoad<PublicUser> = override === null ? state : { kind: 'ready', auth: override };
  const screen = screenOf(effective);

  /**
   * 已登入但未改過初始密碼（issue 124）。
   *
   * 後端在這個狀態下除了 `/me` 與 `/auth/change-password` 之外一律 403
   * `password_change_required`，所以放他入首頁等於讓他看見一堆「沒有權限」
   * —— 那是假的。明確等於 true 才算，缺席不當成 true。
   */
  const mustChangePassword =
    effective.kind === 'ready' && effective.auth.user?.mustChangePassword === true;

  /**
   * 登入後的落點（issue #14）。老闆 → Boss Portal；員工 → 自己部門的 app；
   * 未指派部門就唔入任何 app。判斷只由身份 + registry 決定，唔由歷史決定。
   *
   * 呢個 hook 一定要無條件呼叫（React 的規則），所以未登入時傳 undefined。
   */
  const currentUser = effective.kind === 'ready' ? effective.auth.user : undefined;
  const landing = useLanding(currentUser);

  // 網址只是畫面的鏡子：畫面定了就把 hash 對齊，重新載入仍然停在同一個地方。
  // 比對原始 hash 而不是解析後的 route，空 hash 也要補成 #/。
  // `/app`、`/admin`、`/account` 例外：那幾頁的深連結由該頁自己擁有（決策 C48），
  // 這裡不可以蓋掉它。
  useEffect(() => {
    if (screen !== 'setup' && screen !== 'login' && screen !== 'home') {
      return;
    }

    if (mustChangePassword) {
      if (route !== '/account') {
        navigate('/account');
      }

      return;
    }

    if (
      screen === 'home' &&
      (route === '/app' ||
        route === '/admin' ||
        route === '/account' ||
        route === '/files' ||
        route === '/needs' ||
        route === '/boss' ||
        route === '/design')
    ) {
      return;
    }

    // 啱啱登入、仲在 '/':去自己嘅工作台（issue #14）。`deciding` 期間唔跳，
    // 因為未知道答案之前跳去任何一頁都係猜；寧願多等一個 request。
    if (screen === 'home' && justSignedIn) {
      if (landing.kind !== 'route') {
        return;
      }

      setJustSignedIn(false);

      if (window.location.hash !== `#${landing.path}`) {
        navigate(landing.path);
      }

      return;
    }

    // 已登入、但網址係空：首頁本身係合法的一頁（「我的 Apps」），只係要
    // 把 hash 補成 `#/`，令重新載入與書籤講得通。
    if (screen === 'home') {
      if (window.location.hash !== '#/') {
        navigate('/');
      }

      return;
    }

    const target = ROUTE_OF[screen];

    if (window.location.hash !== `#${target}`) {
      navigate(target);
    }
  }, [screen, route, mustChangePassword, landing, justSignedIn]);

  function signedIn(user: PublicUser): void {
    setNotice(null);
    setOverride({ setupRequired: false, signedIn: true, user });
    setJustSignedIn(true);
  }

  function signedOut(): void {
    setNotice(null);
    setOverride({ setupRequired: false, signedIn: false });
  }

  function alreadySetUp(): void {
    setNotice(t('login.noticeAlreadySetUp'));
    setOverride({ setupRequired: false, signedIn: false });
  }

  /** 改密碼成功之後，後端回的新狀態要蓋過最初那一份（`mustChangePassword` 已變 false）。 */
  function userChanged(user: PublicUser): void {
    setOverride({ setupRequired: false, signedIn: true, user });
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
    // 未改初始密碼：先引導去改（issue 124）。不做一個「假裝可用」的首頁。
    if (mustChangePassword || route === '/account') {
      return (
        <AccountScreen
          user={effective.auth.user}
          onSignedOut={signedOut}
          onUserChanged={userChanged}
          onBack={() => {
            navigate('/');
          }}
        />
      );
    }

    /**
     * 落點（issue #14）。**只喺啱啱登入嗰一刻把關**。
     *
     * 呢一刻之後，用戶自己撳去邊就係邊：`#/` 係「我的 Apps」，`/files`、
     * `/needs`、`/account` 係外殼本身嘅功能，全部照開。把「未指派部門」
     * 變成一個永遠鎖住的閘，會連改密碼、睇自己檔案都做唔到 —— 而呢兩件
     * 事同「有冇部門」無關。真正唔准入 app 的把關在後端：`/modules` 對
     * 未指派的人回空清單，前端冇任何方法自己補一個出來。
     */
    if (justSignedIn && landing.kind === 'deciding') {
      return <LoadingScreen />;
    }

    if (justSignedIn && landing.kind === 'noDepartment') {
      return <NoDepartmentGate onSignOut={signedOut} />;
    }

    if (justSignedIn && landing.kind === 'closed') {
      return <DepartmentClosedGate department={landing.department} onSignOut={signedOut} />;
    }

    // `/app/*` 是原型外殼（issue 118 切片 C）。它標明是原型資料，不是正式 registry 的 app。
    if (route === '/app') {
      return <WorkspacePrototype />;
    }

    // `/admin/*` 是管理區（issue 119 起）。真資料、真 API，沒有原型標示。
    if (route === '/admin') {
      return <AdminArea user={effective.auth.user} onSignedOut={signedOut} />;
    }

    // `/files` 是檔案頁（issue 164）。只接已完成的檔案端點，不改後端。
    if (route === '/files') {
      return <FilesScreen user={effective.auth.user} onSignedOut={signedOut} />;
    }

    // `/needs` 是 Needs 收件匣（issue 184）。Needs 屬外殼，唔屬任何一個 app。
    if (route === '/needs') {
      return <NeedsScreen user={effective.auth.user} onSignedOut={() => signedOut()} />;
    }

    // 部門 app 同 Boss Portal（issue 185）。兩者都係正式頁，唔係原型。
    if (route === '/boss') {
      return <BossPortal user={effective.auth.user} onSignedOut={signedOut} />;
    }

    if (route === '/design') {
      return <DesignApp user={effective.auth.user} onSignedOut={signedOut} />;
    }

    return <HomeScreen user={effective.auth.user} onSignedOut={signedOut} />;
  }

  if (screen === 'setup') {
    return <SetupScreen onCreated={signedIn} onAlreadySetUp={alreadySetUp} />;
  }

  return <LoginScreen notice={notice} onSignedIn={signedIn} />;
}
