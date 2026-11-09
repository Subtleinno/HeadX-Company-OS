import type { ShellNavItem } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import type { Route } from '../router';

/**
 * Frame 全域主選單（議題 158）。
 *
 * 三個標籤全部係真導覽：呼叫端用 onSelectModuleTab 換畫面，唔放按落冇反應嘅鍵。
 * 「管理區」只喺老闆登入時出現，員工唔會見到一條撳落去被拒絕嘅連結。
 * 標籤一律取文案張交付嘅 frame.menu.* 鍵，唔硬寫 UI 字串。
 */
export type MainNavKey = 'today' | 'account' | 'admin';

export const MAIN_NAV_ROUTE: Record<MainNavKey, Route> = {
  today: '/',
  account: '/account',
  admin: '/admin',
};

export function mainNavItems(isOwner: boolean): readonly ShellNavItem[] {
  const items: ShellNavItem[] = [
    { key: 'today', label: t('frame.menu.today') },
    { key: 'account', label: t('frame.menu.account') },
  ];

  if (isOwner) {
    items.push({ key: 'admin', label: t('frame.menu.admin') });
  }

  return items;
}

/**
 * 正式 App selector 嘅 app 清單由共用包裝元件 FrameApps 從 `GET /modules`
 * 取得（F-03／issue 160）：清單只有 manifest 一個來源，唔喺呢度存一份、
 * 唔硬編 app id 或標題。「據點與機器」入口亦唔喺 selector。
 * WorkspacePrototype 嘅 prototype fixtures 係另一套原型資料，唔流入正式畫面。
 */
