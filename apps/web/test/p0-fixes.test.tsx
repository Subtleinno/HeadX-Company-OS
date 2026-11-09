// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { WorkspacePrototype } from '../src/prototype/WorkspacePrototype';
import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';

/**
 * #147 兩個 P0 嘅回歸測試。
 *
 * A：原型第二步選品牌唔可以 bypass `commit()` —— 未保存輸入要出確認。
 * B：管理區「未儲存」對話框要 focus trap、底層 inert、關閉後還原焦點、
 *    `aria-describedby` 指向正文同未儲存項數。
 *
 * 每組都有「移除保護就要紅」嘅負面測試：行為測試本身釘住效果，
 * 靜態守衛釘住實作冇被靜靜拆走。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function at(hash: string): void {
  window.history.replaceState(null, '', hash);
}

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

const SETTINGS = [
  { key: 'acceptance_rule', value: 'owner', updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
  { key: 'company_locale', value: 'zh-HK', updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
  { key: 'department_isolation', value: false, updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
  { key: 'edition', value: 'intl', updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
  { key: 'install_code', value: 'HK', updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
  { key: 'notification_channels', value: ['inapp'], updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
  { key: 'overdue_grace_hours', value: 24, updatedAt: '2026-11-07T02:00:00.000Z', updatedBy: null },
];

/** 開管理區、改成 dirty、撳登出，令「未儲存」對話框出現。 */
async function openDirtyDialog(user: ReturnType<typeof userEvent.setup>) {
  at('/#/admin/settings');

  installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    settings: () => jsonResponse(200, { settings: SETTINGS }),
  });

  render(<App />);

  await waitFor(() => {
    expect(document.querySelectorAll('[data-setting-key]').length).toBe(7);
  });

  const row = document.querySelector('[data-setting-key="department_isolation"]') as HTMLElement;
  const trigger = screen.getByRole('button', { name: '登出' });

  await user.click(within(row).getByRole('checkbox'));
  await user.click(trigger);

  const dialog = await screen.findByRole('dialog');

  return { dialog, trigger, row };
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  delete document.documentElement.dataset.theme;
  window.history.replaceState(null, '', '#/');
});

describe('#147 A：原型第二步選品牌要經 commit()', () => {
  it('有未保存輸入時，第二步選品牌會先出確認，唔會靜靜清空', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.type(screen.getByLabelText('原型備註'), '未保存的內容');
    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const step = screen.getByRole('dialog', { name: '選擇品牌' });
    await user.click(within(step).getByRole('option', { name: /品牌乙/ }));

    expect(screen.getByText(/尚有未保存的輸入/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /App A/ })).toBeTruthy();
    expect((screen.getByLabelText('原型備註') as HTMLTextAreaElement).value).toBe('未保存的內容');
    expect(window.location.hash).toBe('#/app/a/company');
  });

  it('選「留低」：app、品牌、頁面、備註全部唔變', async () => {
    const user = userEvent.setup();
    at('#/app/a/company/home');

    render(<WorkspacePrototype />);

    await user.type(screen.getByLabelText('原型備註'), '要留住');
    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const step = screen.getByRole('dialog', { name: '選擇品牌' });
    await user.click(within(step).getByRole('option', { name: /品牌乙/ }));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.getByRole('heading', { name: /App A/ })).toBeTruthy();
    expect((screen.getByLabelText('原型備註') as HTMLTextAreaElement).value).toBe('要留住');
    expect(window.location.hash).toBe('#/app/a/company/home');
  });

  it('選「放棄」才切換，而且切去第二步揀咗嗰個品牌', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.type(screen.getByLabelText('原型備註'), '可以丟');
    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const step = screen.getByRole('dialog', { name: '選擇品牌' });
    await user.click(within(step).getByRole('option', { name: /品牌乙/ }));
    await user.click(screen.getByRole('button', { name: '放棄並切換' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /App B/ })).toBeTruthy();
    });
    expect(window.location.hash).toBe('#/app/b/brand.yi');
    expect((screen.getByLabelText('原型備註') as HTMLTextAreaElement).value).toBe('');
  });

  it('鍵盤喺第二步選品牌同樣要經確認', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.type(screen.getByLabelText('原型備註'), '鍵盤輸入');
    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const step = screen.getByRole('dialog', { name: '選擇品牌' });
    within(step).getByRole('option', { name: /品牌乙/ }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText(/尚有未保存的輸入/)).toBeTruthy();
    expect((screen.getByLabelText('原型備註') as HTMLTextAreaElement).value).toBe('鍵盤輸入');
  });

  it('負面測試：第二步唔可以直接叫 applySwitch()，拿走 commit() 要紅', () => {
    const text = source('apps/web/src/prototype/WorkspacePrototype.tsx');
    const start = text.indexOf('function chooseBrandFromStep');
    const end = text.indexOf('function selectScope');

    expect(start, '要有獨立嘅第二步處理函式').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const handler = text.slice(start, end);

    expect(handler).toContain('commit(');
    expect(handler).not.toContain('applySwitch(pendingAppId');
    expect(text).toMatch(/onClick=\{\(\) => \{\s*chooseBrandFromStep\(brand\.id\);\s*\}\}/);
  });
});

describe('#147 B：管理區未儲存對話框', () => {
  it('Tab 同 Shift+Tab 只喺對話框內循環', async () => {
    const user = userEvent.setup();
    const { dialog } = await openDirtyDialog(user);

    for (let index = 0; index < 6; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `第 ${index + 1} 次 Tab 唔可以走出對話框`).toBe(true);
    }

    for (let index = 0; index < 6; index += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `第 ${index + 1} 次 Shift+Tab 唔可以走出對話框`).toBe(true);
    }
  });

  it('對話框開著時，外殼與頁面內容要 inert', async () => {
    const user = userEvent.setup();
    await openDirtyDialog(user);

    const shell = document.querySelector('.shell-frame');

    expect(shell).not.toBeNull();
    // inert 要包住成個外殼（含頂欄、左欄、內容區），唔係只遮內容區。
    expect(shell?.closest('[inert]')).not.toBeNull();
  });

  it('aria-describedby 指向正文與未儲存項數，兩個 id 都要存在', async () => {
    const user = userEvent.setup();
    const { dialog } = await openDirtyDialog(user);

    const describedBy = dialog.getAttribute('aria-describedby');

    expect(describedBy).toBe('admin-unsaved-body admin-unsaved-count');

    for (const id of (describedBy ?? '').split(' ')) {
      const node = document.getElementById(id);

      expect(node, `${id} 要喺對話框入面`).not.toBeNull();
      expect(dialog.contains(node)).toBe(true);
    }

    expect(within(dialog).getByText('離開這一頁會丟失未儲存的修改。')).toBeTruthy();
    expect(within(dialog).getByText('未儲存：1 項')).toBeTruthy();
  });

  it('撳「繼續編輯」關閉之後，焦點還原到觸發元件', async () => {
    const user = userEvent.setup();
    const { dialog, trigger } = await openDirtyDialog(user);

    await user.click(within(dialog).getByRole('button', { name: '繼續編輯' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('按 Escape 關閉之後，焦點同樣還原到觸發元件', async () => {
    const user = userEvent.setup();
    const { dialog, trigger } = await openDirtyDialog(user);

    dialog.focus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('負面測試：拿走 focus trap／inert／焦點還原任何一件都要紅', () => {
    const text = source('apps/web/src/admin/AdminArea.tsx');

    expect(text).toContain('trapFocus(event, dialogRef.current)');
    expect(text).toMatch(/function trapFocus[\s\S]*?'Tab'/);
    expect(text).toContain('inert=');
    expect(text).toContain('aria-describedby=');
    expect(text).toContain('triggerRef.current?.focus()');
  });
});
