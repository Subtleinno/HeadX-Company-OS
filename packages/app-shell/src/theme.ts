/**
 * 主題的套用（#118、決策 C49）。
 *
 * 深色嘅值集中在 `packages/design-tokens/src/tokens.css` 的
 * `:root[data-theme='dark']`，所以切換主題只需要喺 documentElement 加一個屬性，
 * 唔需要換 stylesheet、亦唔需要每個元件自己記住而家係咩主題。
 *
 * 刻意**唔會**寫入 localStorage 或 cookie：主題偏好嘅保存方式仍然未定
 * （BASE-UI-DESIGN 第 9.4 節），而 C47 亦禁止用前端儲存去代替未定嘅契約。
 * 所以重新載入之後會返到淺色，呢個係已知限制，唔係漏做。
 */

export type ShellTheme = 'light' | 'dark';

export const SHELL_THEMES: readonly ShellTheme[] = ['light', 'dark'];

export function applyTheme(theme: ShellTheme): void {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.dataset.theme = 'dark';
    return;
  }

  delete root.dataset.theme;
}

export function nextTheme(theme: ShellTheme): ShellTheme {
  return theme === 'dark' ? 'light' : 'dark';
}
