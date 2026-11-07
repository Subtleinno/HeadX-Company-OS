// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Selector, type SelectorOption } from '../src/index.js';

/**
 * 選擇器的契約（#118 切片 B）。
 *
 * 選擇器是外殼唯一「揀嘢」的共用控制：app 選擇器同工作範圍選擇器都用它。
 * 所以鍵盤、焦點、宣佈同 disabled 一律在這裡釘死，唔可以留給每個使用方自己補。
 *
 * 呢個檔刻意唔測樣式：樣式由使用方的 CSS 負責，元件只保證結構與行為。
 */

afterEach(() => {
  cleanup();
});

const options: SelectorOption[] = [
  { id: 'a', label: 'App A' },
  { id: 'b', label: 'App B', description: '品牌型' },
  { id: 'c', label: 'App C', disabled: true, description: '未啟用' },
];

function renderSelector(overrides: Partial<Parameters<typeof Selector>[0]> = {}) {
  const onChange = vi.fn();

  render(
    <Selector
      label="選擇 app"
      value="a"
      options={options}
      placeholder="選擇"
      onChange={onChange}
      {...overrides}
    />,
  );

  return { onChange };
}

describe('Selector：結構與宣佈', () => {
  it('按鈕有無障礙名稱，並顯示目前選中項的文字', () => {
    renderSelector();

    const button = screen.getByRole('button', { name: '選擇 app' });

    expect(button.textContent).toContain('App A');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('未選中時顯示 placeholder，不會假裝有一個值', () => {
    renderSelector({ value: null });

    expect(screen.getByRole('button', { name: '選擇 app' }).textContent).toContain('選擇');
  });

  it('展開後列出所有選項，並用 aria-selected 標明目前值', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('button', { name: '選擇 app' }));

    const items = screen.getAllByRole('option');

    expect(items).toHaveLength(3);
    expect(items[0]?.getAttribute('aria-selected')).toBe('true');
    expect(items[1]?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('button', { name: '選擇 app' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('選項的 disabled 會反映在 aria-disabled，不會靜靜當成可選', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('button', { name: '選擇 app' }));

    const disabled = screen.getAllByRole('option')[2];

    expect(disabled?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Selector：滑鼠與鍵盤', () => {
  it('點一個選項會回傳它的 id，並收起', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelector();

    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.click(screen.getByRole('option', { name: /App B/ }));

    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: '選擇 app' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('點 disabled 的選項不會回傳任何東西', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelector();

    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.click(screen.getByRole('option', { name: /App C/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape 收起，並把焦點還給按鈕（不會把焦點漏在空氣中）', async () => {
    const user = userEvent.setup();
    renderSelector();

    const button = screen.getByRole('button', { name: '選擇 app' });

    await user.click(button);
    await user.keyboard('{Escape}');

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('ArrowDown／ArrowUp 在選項之間移動焦點，Enter 選中', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelector();

    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.keyboard('{ArrowDown}');

    const second = screen.getAllByRole('option')[1];

    expect(document.activeElement).toBe(second);

    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('ArrowDown 會跳過 disabled 選項', async () => {
    const user = userEvent.setup();
    renderSelector({ value: 'b' });

    await user.click(screen.getByRole('button', { name: '選擇 app' }));
    await user.keyboard('{ArrowDown}');

    // 由 App B 再向下：App C 是 disabled，所以焦點留在 B 或者回頭去 A，總之不會停在 C。
    expect(document.activeElement).not.toBe(screen.getAllByRole('option')[2]);
  });
});

describe('Selector：不可用狀態', () => {
  it('disabled 時按鈕不可按，也不會展開', async () => {
    const user = userEvent.setup();
    renderSelector({ disabled: true });

    const button = screen.getByRole('button', { name: '選擇 app' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    await user.click(button);

    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
