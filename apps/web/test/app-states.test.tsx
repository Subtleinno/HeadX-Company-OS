// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';

import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';
import { expectHash } from './helpers/assertions';

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('啟動時的五個狀態', () => {
  it('取得狀態之前顯示「載入中…」，容器帶 aria-busy="true"', () => {
    installFakeApi({ state: () => new Promise(() => undefined) });

    const { container } = render(<App />);

    expect(screen.getByText('載入中…')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('網絡錯誤時顯示「無法連線到伺服器」，重試會再問一次並回到登入', async () => {
    let attempt = 0;
    installFakeApi({
      state: () => {
        attempt += 1;

        if (attempt === 1) {
          throw new TypeError('Failed to fetch');
        }

        return jsonResponse(200, { setupRequired: false, signedIn: false });
      },
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: '無法連線到伺服器' })).toBeTruthy();
    expect(screen.getByText('請確認 Company OS 正在運行，然後重試。')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: '重試' }));

    expect(await screen.findByRole('heading', { name: '登入 Company OS' })).toBeTruthy();
  });

  it('伺服器 5xx 一樣當作連不到，不顯示空白頁', async () => {
    installFakeApi({ state: () => jsonResponse(503, { status: 'error' }) });

    render(<App />);

    expect(await screen.findByRole('heading', { name: '無法連線到伺服器' })).toBeTruthy();
  });

  it('setupRequired 為 true 時顯示建立老闆帳戶，網址同步為 #/setup', async () => {
    installFakeApi({ state: () => jsonResponse(200, { setupRequired: true, signedIn: false }) });

    render(<App />);

    expect(await screen.findByRole('heading', { name: '建立老闆帳戶' })).toBeTruthy();
    expect(screen.getByText('這個帳戶是整個 Company OS 的老闆，只可以建立一次。')).toBeTruthy();
    await expectHash('/setup');
  });

  it('已開機但未登入時顯示登入，網址同步為 #/login', async () => {
    installFakeApi({ state: () => jsonResponse(200, { setupRequired: false, signedIn: false }) });

    render(<App />);

    expect(await screen.findByRole('heading', { name: '登入 Company OS' })).toBeTruthy();
    await expectHash('/login');
  });

  it('已登入時顯示首頁骨架與誠實的空狀態', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: '今日' })).toBeTruthy();
    expect(
      screen.getByText(
        '目前沒有任何待處理事項。待批准、Needs 與各部門的狀況，會在對應功能建好後出現在這裡。',
      ),
    ).toBeTruthy();
    expect(screen.getByText('陳老闆')).toBeTruthy();
    // 公司名如實顯示未提供（GET /me 無公司名、SettingKey 無公司名 key）；
    // Frame 外殼頁尾由共用外殼以 frame.company.nameMissing 顯示，唔用示意值。
    expect(screen.getByText('公司名稱未提供')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登出' })).toBeTruthy();
    await expectHash('/');
  });

  it('首頁沒有任何假數據', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    });

    const { container } = render(<App />);

    await screen.findByRole('heading', { name: '今日' });

    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    // 外殼頂欄嘅圖示係合法 svg；呢條釘住「內容區沒有假數據圖表」。
    expect(container.querySelector('[data-frame-main] table')).toBeNull();
    expect(container.querySelector('[data-frame-main] canvas')).toBeNull();
    expect(container.querySelector('[data-frame-main] svg')).toBeNull();
  });

  it('首頁有一條通往新外殼原型的連結，並講明是示範', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    });

    render(<App />);

    await screen.findByRole('heading', { name: '今日' });

    const entry = screen.getByRole('link', { name: 'Base UI 原型外殼' });

    expect(entry.getAttribute('href')).toBe('#/app/a/company');
    expect(screen.getByText('示範 app 與工作範圍切換，未接駁業務內容。')).toBeTruthy();
  });
});
