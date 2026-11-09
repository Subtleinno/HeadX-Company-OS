// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePrototype } from '../src/prototype/WorkspacePrototype';
import { findPage, PROTOTYPE_APPS, PROTOTYPE_PAGES } from '../src/prototype/fixtures';

/**
 * 原型外殼的行為（#118 切片 C）。
 *
 * 呢個檔只驗「共用外殼行為」：第二步選範圍、返回、未保存、慢回應與失敗。
 * 資料一律係原型 fixture（App A／B／C、品牌甲／乙），冇任何真實 app 或品牌。
 *
 * 每一條都想釘住一種「睇落成功但其實錯」嘅情況：按返回之後偷偷換咗 app、
 * 失敗當成空資料、舊回應蓋過新範圍。
 */

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  window.history.replaceState(null, '', '#/');
});

function at(hash: string): void {
  window.history.replaceState(null, '', hash);
}

describe('深連結與重整', () => {
  it('深連結指定 app、品牌與頁面時，直接落在那個位置', () => {
    at('#/app/b/brand.jia/overview');

    render(<WorkspacePrototype />);

    expect(screen.getByRole('heading', { name: /App B/ })).toBeTruthy();
    expect(document.querySelector('[data-frame-slot="scope"]')?.textContent).toContain('品牌甲');
    expect(screen.getByText('品牌總覽')).toBeTruthy();
  });

  it('品牌型但網址未指定品牌：明示要選品牌，不會顯示成功畫面', () => {
    at('#/app/b');

    render(<WorkspacePrototype />);

    const main = document.querySelector('[data-frame-main]');

    expect(main?.textContent).toContain('請選擇品牌');
    expect(screen.getByText('這個 app 要先選品牌，才開始工作。')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /App B/ })).toBeNull();
  });

  it('網址不合法時如實講，不會靜靜跌去首頁', () => {
    at('#/app/b/nonsense');

    render(<WorkspacePrototype />);

    expect(screen.getByText(/網址無法辨識/)).toBeTruthy();
  });

  it('app id 格式合法但不存在時如實講，不會扮成 App A', () => {
    at('#/app/zzz');

    render(<WorkspacePrototype />);

    expect(screen.getByText(/網址無法辨識/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /App A/ })).toBeNull();
  });

  it('品牌 id 不存在時如實講，不會顯示一個假的品牌範圍', () => {
    at('#/app/b/brand.qq');

    render(<WorkspacePrototype />);

    expect(screen.getByText(/網址無法辨識/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /App B/ })).toBeNull();
  });

  it('頁面 key 不屬於該 app 時如實講', () => {
    at('#/app/a/company/overview');

    render(<WorkspacePrototype />);

    expect(screen.getByText(/網址無法辨識/)).toBeTruthy();
  });

  it('由非法畫面按「回到 app 入口」真的回到 App A 公司範圍', async () => {
    const user = userEvent.setup();
    at('#/app/zzz');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('link', { name: '回到 app 入口' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /App A/ })).toBeTruthy();
    });
    expect(screen.queryByText(/網址無法辨識/)).toBeNull();
    expect(window.location.hash).toBe('#/app/a/company');
  });
});

describe('切 app：第二步與取消', () => {
  it('由公司型切去品牌型：先問品牌，未選之前仍然留在原本的 app', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const dialog = screen.getByRole('dialog', { name: '選擇品牌' });

    expect(within(dialog).getAllByRole('option').length).toBe(2);
    expect(screen.getByRole('heading', { name: /App A/ })).toBeTruthy();
  });

  it('按「返回」離開第二步：留在原 app 與原範圍，不會偷偷切換', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));
    await user.click(screen.getByRole('button', { name: '返回' }));

    expect(screen.getByRole('heading', { name: /App A/ })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.hash).toBe('#/app/a/company');
  });

  it('第二步只有一個離開按鈕（返回），不並列取消', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const dialog = screen.getByRole('dialog', { name: '選擇品牌' });
    const buttons = within(dialog).getAllByRole('button');

    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('返回');
    expect(within(dialog).queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('在第二步選了品牌才會切換，而且網址同步到新位置', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App B' }));

    const dialog = screen.getByRole('dialog', { name: '選擇品牌' });

    await user.click(within(dialog).getByRole('option', { name: /品牌乙/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /App B/ })).toBeTruthy();
    });
    expect(window.location.hash).toBe('#/app/b/brand.yi');
  });

  it('品牌型之間切換會保留同一個品牌，不需要重新選', async () => {
    const user = userEvent.setup();
    at('#/app/b/brand.jia');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App C' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /App C/ })).toBeTruthy();
    });
    expect(document.querySelector('[data-frame-slot="scope"]')?.textContent).toContain('品牌甲');
  });
});

describe('未保存', () => {
  it('有未保存輸入時切換會先確認；取消保留原本內容', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    const note = screen.getByLabelText('原型備註') as HTMLTextAreaElement;

    await user.type(note, '未保存的內容');
    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App C' }));

    expect(screen.getByText(/尚有未保存的輸入/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.getByRole('heading', { name: /App A/ })).toBeTruthy();
    expect((screen.getByLabelText('原型備註') as HTMLTextAreaElement).value).toBe('未保存的內容');
  });

  it('確認放棄之後才切換', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    render(<WorkspacePrototype />);

    await user.type(screen.getByLabelText('原型備註'), '內容');
    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(screen.getByRole('option', { name: 'App C' }));
    await user.click(screen.getByRole('button', { name: '放棄並切換' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /App C/ })).toBeTruthy();
    });
  });
});

describe('慢回應與失敗', () => {
  it('慢回應回來時不可覆蓋新範圍的畫面', async () => {
    const user = userEvent.setup();
    at('#/app/b/brand.jia');

    let resolveFirst: (value: string) => void = () => undefined;

    const loadLabel = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementation(() => Promise.resolve('品牌乙的內容'));

    render(<WorkspacePrototype loadLabel={loadLabel} />);

    // 切去品牌乙（第二個請求即刻回來）
    await user.click(screen.getByRole('button', { name: '選擇品牌' }));
    await user.click(screen.getByRole('option', { name: /品牌乙/ }));

    await waitFor(() => {
      expect(screen.getByText('品牌乙的內容')).toBeTruthy();
    });

    // 第一個（品牌甲）現在才回來，不可以蓋過品牌乙
    resolveFirst('品牌甲的內容');

    await waitFor(() => {
      expect(screen.queryByText('品牌甲的內容')).toBeNull();
    });
    expect(screen.getByText('品牌乙的內容')).toBeTruthy();
  });

  it('讀取失敗時如實顯示失敗與重試，不會當成空資料', async () => {
    const user = userEvent.setup();
    at('#/app/a/company');

    const loadLabel = vi.fn().mockRejectedValue(new Error('boom'));

    render(<WorkspacePrototype loadLabel={loadLabel} />);

    await waitFor(() => {
      expect(screen.getByText('讀取失敗')).toBeTruthy();
    });

    loadLabel.mockResolvedValue('公司範圍的內容');

    await user.click(screen.getByRole('button', { name: '重試' }));

    await waitFor(() => {
      expect(screen.getByText('公司範圍的內容')).toBeTruthy();
    });
  });
});

/*
 * 2026-11-07 視覺對照時揭出來的：主選單的 key 是 `b.home`，頁面 key 是 `overview`，
 * 兩邊對不上。結果按一下 app 主選單，第二行與工作欄即刻消失，而且三行都標不到
 * 「你在這裡」。呢兩條釘住個修正，唔准回頭。
 */
describe('導覽的 key 要對得上頁面', () => {
  it('三層導覽（主選單、第二行、工作欄）的 key 都找得到頁面', () => {
    for (const app of PROTOTYPE_APPS) {
      for (const item of app.menu) {
        expect(findPage(app.id, item.key), `${app.id}/${item.key}`).not.toBeNull();
      }

      for (const page of PROTOTYPE_PAGES[app.id] ?? []) {
        for (const item of [...page.subMenu, ...page.rail]) {
          expect(findPage(app.id, item.key), `${app.id}/${item.key}`).not.toBeNull();
        }
      }
    }
  });

  it('按 app 主選單不會弄走第二行與工作欄，並標明現行位置', async () => {
    const user = userEvent.setup();
    at('#/app/b/brand.jia/overview');

    render(<WorkspacePrototype />);

    await user.click(screen.getByRole('button', { name: '品牌主頁' }));

    const tab = screen.getByRole('button', { name: '品牌主頁' });

    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('品牌總覽')).toBeTruthy();
    expect(document.querySelector('[data-frame-rail]')).not.toBeNull();
  });

  it('按第二行或工作欄的項目，同樣留在這一頁', async () => {
    const user = userEvent.setup();
    at('#/app/b/brand.jia/overview');

    render(<WorkspacePrototype />);

    await user.click(screen.getByText('品牌總覽'));
    expect(document.querySelector('[data-frame-rail]')).not.toBeNull();

    await user.click(screen.getByText('品牌工作'));
    expect(screen.getByText('品牌總覽')).toBeTruthy();

    await waitFor(() => {
      expect(window.location.hash).toBe('#/app/b/brand.jia/overview');
    });
  });
});
