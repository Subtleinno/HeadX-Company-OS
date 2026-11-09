/**
 * 頁面外殼的公開介面。
 *
 * 只抽 apps/web 本來就有的東西：外殼（頂欄）、卡片畫面框架、空狀態、錯誤框架，
 * 以及登入守衛。沒有導覽器、沒有新畫面、沒有新流程。
 *
 * 刻意不 import platform-kit 或任何 app：登入狀態由 `useAuthGate` 的呼叫端注入。
 */

export { AppShell, ShellContent } from './AppShell.js';
export { BaseShell } from './BaseShell.js';
export type { BaseShellProps } from './BaseShell.js';
export { FrameShell } from './FrameShell.js';
export type { FrameApp, FrameBlocked, FrameShellProps, FrameSidebarGroup } from './FrameShell.js';
export { Icon } from './icons.js';
export type { IconName } from './icons.js';
export { applyTheme, nextTheme, SHELL_THEMES } from './theme.js';
export type { ShellTheme } from './theme.js';
export type { AppMode, BrandRef, PrototypeApp, ScopeTarget, ShellNavItem } from './workspace.js';
export { buildShellHash, isScopeAllowed, parseShellHash, planAppSwitch, SHELL_PATH_ROOT } from './deep-link.js';
export type { ParsedShellHash, SwitchPlan } from './deep-link.js';
export { EmptyState, ScreenFrame, StatusScreen } from './ScreenFrame.js';
export { ConnectionErrorScreen, LoadingScreen } from './StatusScreens.js';
export { screenOf, useAuthGate } from './AuthGate.js';
export type { AuthLoad, AuthSnapshot, Screen, ShellUser } from './AuthGate.js';
