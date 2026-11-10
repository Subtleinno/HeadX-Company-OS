import type { ReactElement } from 'react';

/**
 * 外殼的 monoline 圖示（#118，2026-11-07 視覺對齊）。
 *
 * 幾何與線寬對齊 HxDesign 外殼用的那一套：24 格、1.6px 線、圓頭圓角接。
 * 尺寸、位置、顏色由 CSS 決定（見 base-shell.css 的 `.ic`），這裡只畫路徑。
 *
 * 為甚麼不共用 HxDesign 的 sprite：那需要跨 repo 的授權與同步來源，而 sprite
 * 一旦出現兩份就會各自漂移。這裡畫的是等效幾何，來源與版本記錄在
 * docs/product/BASE-UI-HXDESIGN-ALIGNMENT.md。
 *
 * 不用圖示庫、不用 emoji：圖示是外殼的一部分，不是內容。
 */

export type IconName =
  | 'menu'
  | 'chev-down'
  | 'check'
  | 'monitor'
  | 'cube'
  | 'sparkle'
  | 'sun'
  | 'moon'
  | 'search'
  | 'bell'
  | 'help'
  | 'panel';

const SHAPES: Record<IconName, ReactElement> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  'chev-down': <path d="m7 10 5 5 5-5" />,
  check: <path d="m5 12 5 5L20 7" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  sparkle: (
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 6-2.5 8h17c0-2-2.5-2-2.5-8Z" />
      <path d="M10 20.5h4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.9.4-1.1 1-1.1 1.9" />
      <path d="M12 17.2h.01" />
    </>
  ),
  /* 右側欄開關（issue 184）：一個框、右邊一條分界線。 */
  panel: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </>
  ),
};

export function Icon({ name, className = 'ic' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {SHAPES[name]}
    </svg>
  );
}
