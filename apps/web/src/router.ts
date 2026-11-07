import { useEffect, useState } from 'react';

/**
 * 自己寫的 hash 路由，不引入路由套件。
 *
 * 網址只是畫面的鏡子：哪一個畫面由 `GET /api/auth/state` 決定，
 * 這支只負責把網址同步成 `#/`、`#/login`、`#/setup`，令重新載入與書籤仍然講得通。
 */

export type Route = '/' | '/login' | '/setup' | '/app';

const ROUTES: readonly string[] = ['/', '/login', '/setup', '/app'];

/** `/app` 之下的一切（`/app/b/brand.jia/overview`）都屬於同一個畫面，由該畫面自己解析深連結。 */
export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#/, '');

  if (value === '/app' || value.startsWith('/app/')) {
    return '/app';
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
