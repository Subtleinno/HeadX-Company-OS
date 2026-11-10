import { useEffect, useState } from 'react';

/**
 * 自己寫的 hash 路由，不引入路由套件。
 *
 * 網址只是畫面的鏡子：哪一個畫面由 `GET /api/auth/state` 決定，
 * 這支只負責把網址同步成 `#/`、`#/login`、`#/setup`，令重新載入與書籤仍然講得通。
 */

export type Route =
  | '/'
  | '/login'
  | '/setup'
  | '/app'
  | '/admin'
  | '/account'
  | '/files'
  | '/needs'
  | '/boss'
  | '/design';

const ROUTES: readonly string[] = [
  '/',
  '/login',
  '/setup',
  '/app',
  '/admin',
  '/account',
  '/files',
  '/needs',
  '/boss',
  '/design',
];

/**
 * `/app` 之下的一切（`/app/b/brand.jia/overview`）都屬於同一個畫面，由該畫面自己解析深連結。
 * `/admin` 同理：`/admin/settings` 由管理區自己解析是哪一頁（issue 119）。
 * `/account` 是個人帳戶與安全（issue 124），沒有子路徑。
 */
export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#/, '');

  if (value === '/app' || value.startsWith('/app/')) {
    return '/app';
  }

  if (value === '/admin' || value.startsWith('/admin/')) {
    return '/admin';
  }

  // 部門 app 同 Boss Portal 一樣：`#/design/brand/identity` 屬同一個畫面，
  // 底下是哪個模組、哪一頁由該畫面自己解析（同 `/app`、`/admin` 同一道理）。
  if (value === '/boss' || value.startsWith('/boss/')) {
    return '/boss';
  }

  if (value === '/design' || value.startsWith('/design/')) {
    return '/design';
  }

  return ROUTES.includes(value) ? (value as Route) : '/';
}

/** 已掛載的訂閱者；navigate 直接通知，不用等 hashchange（replaceState 不會觸發它）。 */
const listeners = new Set<() => void>();

export function navigate(route: Route): void {
  window.history.replaceState(null, '', `#${route}`);

  for (const listener of listeners) {
    listener();
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const update = (): void => {
      setRoute(parseRoute(window.location.hash));
    };

    listeners.add(update);
    window.addEventListener('hashchange', update);
    update();

    return () => {
      window.removeEventListener('hashchange', update);
      listeners.delete(update);
    };
  }, []);

  return route;
}

/**
 * 目前網址在 base 之後的段落：`#/design/brand/identity` → `['brand', 'identity']`。
 *
 * 部門 app 的「哪個模組、哪一頁」係畫面自己的事，唔關路由事；但畫面要
 * 知道網址講咩，而且要知道網址變了。所以呢一支只做一件事：把段落切出來，
 * 並跟 `navigate`／`hashchange` 一齊更新。
 */
export function useHashPath(): string[] {
  const read = (): string[] =>
    window.location.hash
      .replace(/^#/, '')
      .split('/')
      .filter((part) => part.length > 0)
      // 第一段係 base（design、boss），其餘才係模組同頁。
      .slice(1);

  const [path, setPath] = useState<string[]>(read);

  useEffect(() => {
    const update = (): void => {
      setPath(read());
    };

    listeners.add(update);
    window.addEventListener('hashchange', update);
    update();

    return () => {
      window.removeEventListener('hashchange', update);
      listeners.delete(update);
    };
  }, []);

  return path;
}

/** 把段落接成 hash 並跳過去。畫面只需要講「我要去邊」，唔需要自己砌字串。 */
export function navigatePath(route: Route, ...segments: string[]): void {
  navigate(([route, ...segments].join('/').replace(/\/+/g, '/')) as Route);
}
