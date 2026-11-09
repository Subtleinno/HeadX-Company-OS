import { useState } from 'react';
import { nextTheme, type ShellTheme } from '@company-os/app-shell';

/**
 * Frame 外殼嘅本機狀態（議題 158）。
 *
 * 主題同側欄開關沿用既有 theme／onToggleTheme 接線；唔新增深色切換鍵、
 * 唔做深色偏好持久化（light-only 降級）。每個畫面各自持有狀態，同舊外殼一致。
 */
export function useFrameChrome(): {
  theme: ShellTheme;
  onToggleTheme: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
} {
  const [theme, setTheme] = useState<ShellTheme>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return {
    theme,
    onToggleTheme: () => {
      setTheme((current) => nextTheme(current));
    },
    sidebarOpen,
    onToggleSidebar: () => {
      setSidebarOpen((open) => !open);
    },
  };
}
