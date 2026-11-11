// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@company-os/i18n';
import './helpers/rtl';
import { App } from '../src/App';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
  type RecordedRequest,
} from './helpers/fake-api';

/**
 * 檔案頁（issue 164／F-06）。
 *
 * 一律用真 `App` 同真 hash 路由 `/#/files`，唔直接渲染畫面元件：
 * 「主選單到唔到得了、網址對唔對、路由會唔會被外殼彈返首頁」都係驗收一部分。
 *
 * 呢張最緊要係四條底線：上傳 body 係原始 `File`（唔字串化、唔送校驗標頭）；
 * 檔名只當純文字；唔硬編上傳上限；讀取失敗唔可以偽裝成空清單。
 */

const OWNER = {
  id: 'u1',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  mustChangePassword: false,
};
const STAFF = {
  id: 's1',
  email: 'staff@example.com',
  displayName: '林慧',
  role: 'staff',
  // 有部門才見得到首頁與主選單（issue #14）。
  department: 'design',
  mustChangePassword: false,
};

type FileView = {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

function file(over: Partial<FileView> = {}): FileView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    originalName: '季度報告.txt',
    contentType: 'text/plain',
    sizeBytes: 512,
    sha256: 'a'.repeat(64),
    createdAt: '2026-11-09T10:00:00.000Z',
    ...over,
  };
}

const NEVER: Promise<never> = new Promise(() => undefined);

function openFiles(handlers: FakeHandlers = {}, user: typeof OWNER | typeof STAFF = STAFF) {
  window.history.replaceState(null, '', '/#/files');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [] }),
    me: () => jsonResponse(200, { user }),
    filesList: () => jsonResponse(200, { files: [], nextCursor: null }),
    ...handlers,
  });

  render(<App />);

  return api;
}

async function waitForPage(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector('[data-files-page]')).not.toBeNull();
  });
}

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-files-row]'));
}

async function waitRows(count: number): Promise<void> {
  await waitFor(() => {
    expect(rows().length).toBe(count);
  });
}

function names(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-files-name]')).map(
    (element) => element.textContent ?? '',
  );
}

function uploadCalls(api: { calls: RecordedRequest[] }): RecordedRequest[] {
  return api.calls.filter((call) => call.method === 'POST' && call.path === '/api/files');
}

/** 選一個檔再撳「上傳」。 */
async function selectAndUpload(selected: File): Promise<void> {
  await userEvent.upload(screen.getByLabelText(t('files.upload.select')), selected);
  await userEvent.click(screen.getByRole('button', { name: t('files.upload.action') }));
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const webSrc = resolve(repoRoot, 'apps/web/src');

function listSources(directory: string): string[] {
  const result: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...listSources(full));
    } else if (['.ts', '.tsx', '.css'].includes(extname(full))) {
      result.push(full);
    }
  }

  return result;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('檔案頁：路由、主選單同外殼', () => {
  it('真路由 /#/files 會渲染檔案頁，唔會被外殼彈返首頁', async () => {
    openFiles();
    await waitForPage();
    expect(window.location.hash).toBe('#/files');
    expect(screen.getByRole('heading', { name: t('files.title'), level: 1 })).toBeTruthy();
  });

  it('主選單「檔案」所有已登入用戶可見，次序係今日、檔案、帳戶', async () => {
    window.history.replaceState(null, '', '/#/');
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: STAFF }),
      modules: () => jsonResponse(200, { modules: [] }),
    });
    render(<App />);

    await waitFor(() => {
      expect(document.querySelector('[data-frame-slot="modules"]')).not.toBeNull();
    });

    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>('[data-frame-slot="modules"] button'),
    ).map((button) => button.textContent ?? '');

    expect(tabs).toEqual([
      t('frame.menu.today'),
      t('files.menu.label'),
      t('frame.menu.account'),
    ]);
  });

  it('老闆主選單次序係今日、檔案、帳戶、管理區', async () => {
    window.history.replaceState(null, '', '/#/');
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: OWNER }),
      modules: () => jsonResponse(200, { modules: [] }),
    });
    render(<App />);

    await waitFor(() => {
      expect(document.querySelector('[data-frame-slot="modules"]')).not.toBeNull();
    });

    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>('[data-frame-slot="modules"] button'),
    ).map((button) => button.textContent ?? '');

    expect(tabs).toEqual([
      t('frame.menu.today'),
      t('files.menu.label'),
      t('frame.menu.account'),
      t('frame.menu.admin'),
    ]);
  });

  it('由主選單撳「檔案」會去 /#/files 並開啟檔案頁', async () => {
    window.history.replaceState(null, '', '/#/');
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: STAFF }),
      modules: () => jsonResponse(200, { modules: [] }),
      filesList: () => jsonResponse(200, { files: [], nextCursor: null }),
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: t('files.menu.label') }));
    await waitForPage();
    expect(window.location.hash).toBe('#/files');
  });

  it('沿用 Frame 外殼，唔新增外殼元件', async () => {
    openFiles();
    await waitForPage();
    expect(document.querySelector('[data-frame-theme]')).not.toBeNull();
    expect(document.querySelector('[data-frame-main]')).not.toBeNull();
  });
});

describe('檔案頁：列表狀態', () => {
  it('載入中顯示 status.loading', async () => {
    openFiles({ filesList: () => NEVER });
    await waitFor(() => {
      expect(document.querySelector('[data-files-loading]')).not.toBeNull();
    });
    expect(document.querySelector('[data-files-loading]')?.textContent).toContain(
      t('status.loading'),
    );
  });

  it('空清單（員工版）用 files.empty.staff 同 files.lead.staff', async () => {
    openFiles({}, STAFF);
    await waitFor(() => {
      expect(document.querySelector('[data-files-empty]')).not.toBeNull();
    });
    expect(document.querySelector('[data-files-empty]')?.textContent).toContain(
      t('files.empty.staff'),
    );
    expect(document.querySelector('[data-files-lead]')?.textContent).toContain(
      t('files.lead.staff'),
    );
  });

  it('空清單（老闆版）用 files.empty.owner 同 files.lead.owner', async () => {
    openFiles({}, OWNER);
    await waitFor(() => {
      expect(document.querySelector('[data-files-empty]')).not.toBeNull();
    });
    expect(document.querySelector('[data-files-empty]')?.textContent).toContain(
      t('files.empty.owner'),
    );
    expect(document.querySelector('[data-files-lead]')?.textContent).toContain(
      t('files.lead.owner'),
    );
  });

  it('角色只影響文案，前端唔因角色改請求', async () => {
    const staffApi = openFiles({}, STAFF);
    await waitForPage();
    expect(staffApi.calls.filter((call) => call.method === 'GET' && call.path.startsWith('/api/files')).length).toBeGreaterThan(0);
    const staffList = staffApi.calls.find((call) => call.method === 'GET' && call.path.startsWith('/api/files'));
    cleanup();

    const ownerApi = openFiles({}, OWNER);
    await waitForPage();
    const ownerList = ownerApi.calls.find((call) => call.method === 'GET' && call.path.startsWith('/api/files'));
    expect(ownerList?.path).toBe(staffList?.path);
  });

  it('有資料：五個欄位標題齊全，次序照後端回傳，唔喺前端重排', async () => {
    const list = [
      file({ id: 'a', originalName: '丙.txt' }),
      file({ id: 'b', originalName: '甲.txt' }),
      file({ id: 'c', originalName: '乙.txt' }),
    ];
    openFiles({ filesList: () => jsonResponse(200, { files: list, nextCursor: null }) });
    await waitRows(3);

    const headers = Array.from(document.querySelectorAll<HTMLElement>('th[scope="col"]')).map(
      (cell) => cell.textContent ?? '',
    );
    expect(headers).toEqual([
      t('files.column.name'),
      t('files.column.type'),
      t('files.column.size'),
      t('files.column.uploadedAt'),
      t('files.column.checksum'),
    ]);
    expect(names()).toEqual(['丙.txt', '甲.txt', '乙.txt']);
  });

  it('列表無上傳者欄位', async () => {
    openFiles({ filesList: () => jsonResponse(200, { files: [file()], nextCursor: null }) });
    await waitRows(1);
    const text = document.querySelector('[data-files-page]')?.textContent ?? '';
    expect(text).not.toContain('上傳者');
    expect(text).not.toContain('createdBy');
    expect(document.querySelectorAll('th[scope="col"]').length).toBe(5);
  });

  it('nextCursor 載入更多：接落尾、唔重複、用 cursor 續頁；null 顯示已到最後', async () => {
    let call = 0;
    const api = openFiles({
      filesList: (request) => {
        call += 1;
        if (call === 1) {
          return jsonResponse(200, {
            files: [file({ id: 'a', originalName: '甲.txt' }), file({ id: 'b', originalName: '乙.txt' })],
            nextCursor: 'opaque-cursor-1',
          });
        }
        expect(request.path).toContain('cursor=opaque-cursor-1');
        return jsonResponse(200, {
          files: [file({ id: 'c', originalName: '丙.txt' }), file({ id: 'd', originalName: '丁.txt' })],
          nextCursor: null,
        });
      },
    });
    await waitRows(2);

    await userEvent.click(screen.getByRole('button', { name: t('files.loadMore') }));
    await waitRows(4);

    expect(names()).toEqual(['甲.txt', '乙.txt', '丙.txt', '丁.txt']);
    const ids = rows().map((row) => row.getAttribute('data-files-row'));
    expect(new Set(ids).size).toBe(4);
    expect(document.querySelector('[data-files-end]')?.textContent).toContain(t('files.endOfList'));
    expect(document.querySelector('[data-files-more]')).toBeNull();

    const listCalls = api.calls.filter((item) => item.method === 'GET' && item.path.startsWith('/api/files'));
    expect(listCalls[0]?.path).toContain('limit=50');
    expect(listCalls[0]?.path).not.toContain('cursor=');
  });

  it('nextCursor 為 null 顯示已到最後，唔提供載入更多', async () => {
    openFiles({ filesList: () => jsonResponse(200, { files: [file()], nextCursor: null }) });
    await waitRows(1);
    expect(document.querySelector('[data-files-end]')?.textContent).toContain(t('files.endOfList'));
    expect(document.querySelector('[data-files-more]')).toBeNull();
  });

  it('四個大小單位鍵都傳齊 {count} 變數', async () => {
    const list = [
      file({ id: 'a', sizeBytes: 512 }),
      file({ id: 'b', sizeBytes: 2048 }),
      file({ id: 'c', sizeBytes: 5 * 1024 * 1024 }),
      file({ id: 'd', sizeBytes: 3 * 1024 * 1024 * 1024 }),
    ];
    openFiles({ filesList: () => jsonResponse(200, { files: list, nextCursor: null }) });
    await waitRows(4);
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('[data-files-size]')).map(
      (cell) => cell.textContent ?? '',
    );
    expect(sizes[0]).toContain(t('files.size.bytes', { count: 512 }));
    expect(sizes[1]).toContain(t('files.size.kb', { count: 2 }));
    expect(sizes[2]).toContain(t('files.size.mb', { count: 5 }));
    expect(sizes[3]).toContain(t('files.size.gb', { count: 3 }));
  });

  it('讀取失敗加重試，唔顯示成空清單', async () => {
    let call = 0;
    openFiles({
      filesList: () => {
        call += 1;
        return call === 1
          ? jsonResponse(500, { error: 'boom' })
          : jsonResponse(200, { files: [file()], nextCursor: null });
      },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-files-failed]')).not.toBeNull();
    });
    expect(document.querySelector('[data-files-failed]')?.textContent).toContain(
      t('files.loadFailed'),
    );
    expect(document.querySelector('[data-files-empty]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: t('admin.retry') }));
    await waitRows(1);
  });

  it('讀取網絡失敗用 error.network，唔係空清單', async () => {
    openFiles({ filesList: () => Promise.reject(new Error('offline')) });
    await waitFor(() => {
      expect(document.querySelector('[data-files-failed]')).not.toBeNull();
    });
    expect(document.querySelector('[data-files-failed]')?.textContent).toContain(t('error.network'));
    expect(document.querySelector('[data-files-empty]')).toBeNull();
  });

  it('全程無 localStorage／sessionStorage', async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    openFiles({ filesList: () => jsonResponse(200, { files: [file()], nextCursor: null }) });
    await waitRows(1);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('檔案頁：上傳', () => {
  it('上傳 body 係同一個 File、header 正確且 URL 編碼、唔含 X-Content-SHA256、未被字串化', async () => {
    const selected = new File(['hello'], '報告 2026.txt', { type: 'text/plain' });
    const api = openFiles({
      filesUpload: () => jsonResponse(201, file({ originalName: '報告 2026.txt' })),
    });
    await waitForPage();

    await selectAndUpload(selected);
    await waitFor(() => {
      expect(uploadCalls(api).length).toBe(1);
    });

    const call = uploadCalls(api)[0] as RecordedRequest;
    expect(call.rawBody).toBe(selected);
    expect(call.rawBody instanceof File).toBe(true);
    expect(typeof call.rawBody).not.toBe('string');
    expect(call.body).not.toContain('{');
    expect(call.contentType).toBe('text/plain');
    expect(call.headers['x-file-name']).toBe(encodeURIComponent('報告 2026.txt'));
    expect(call.headers['x-content-sha256']).toBeUndefined();
  });

  it('file.type 為空時用 application/octet-stream', async () => {
    const selected = new File(['binary'], 'no-type.bin', { type: '' });
    const api = openFiles({ filesUpload: () => jsonResponse(201, file()) });
    await waitForPage();
    await selectAndUpload(selected);
    await waitFor(() => {
      expect(uploadCalls(api).length).toBe(1);
    });
    expect(uploadCalls(api)[0]?.contentType).toBe('application/octet-stream');
  });

  it('上傳成功後重新讀取第一頁', async () => {
    const selected = new File(['hello'], 'a.txt', { type: 'text/plain' });
    const api = openFiles({ filesUpload: () => jsonResponse(201, file()) });
    await waitForPage();
    await selectAndUpload(selected);

    await waitFor(() => {
      expect(api.count('filesList')).toBe(2);
    });
    const listCalls = api.calls.filter((item) => item.method === 'GET' && item.path.startsWith('/api/files'));
    expect(listCalls[1]?.path).toContain('limit=50');
    expect(listCalls[1]?.path).not.toContain('cursor=');
    expect(document.querySelector('[data-files-notice]')?.textContent).toContain(
      t('files.upload.success'),
    );
  });

  it('上傳中停用上傳鍵防重送，唔顯示進度百分比，唔宣稱已校驗', async () => {
    const selected = new File(['hello'], 'a.txt', { type: 'text/plain' });
    const api = openFiles({ filesUpload: () => NEVER });
    await waitForPage();
    await selectAndUpload(selected);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('files.upload.uploading') })).toBeTruthy();
    });
    const button = screen.getByRole('button', { name: t('files.upload.uploading') }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(uploadCalls(api).length).toBe(1);

    const text = document.querySelector('[data-files-page]')?.textContent ?? '';
    expect(text).not.toMatch(/%|進度/);
    expect(text).not.toContain('已校驗');
  });

  async function expectUploadMessage(
    response: () => ReturnType<typeof jsonResponse> | Promise<never>,
    message: string,
  ): Promise<void> {
    const selected = new File(['hello'], 'a.txt', { type: 'text/plain' });
    openFiles({ filesUpload: response });
    await waitForPage();
    await selectAndUpload(selected);
    await waitFor(() => {
      expect(document.querySelector('[data-files-notice]')?.textContent).toContain(message);
    });
    expect(document.querySelector('[data-files-notice]')?.textContent).not.toContain(
      t('files.upload.success'),
    );
  }

  it('400 invalid_content_type → files.upload.error.invalidType', async () => {
    await expectUploadMessage(
      () => jsonResponse(400, { error: 'invalid_content_type' }),
      t('files.upload.error.invalidType'),
    );
  });

  it('400 invalid_file_name → files.upload.error.invalidName', async () => {
    await expectUploadMessage(
      () => jsonResponse(400, { error: 'invalid_file_name' }),
      t('files.upload.error.invalidName'),
    );
  });

  it('422 checksum_mismatch → files.upload.error.checksum', async () => {
    await expectUploadMessage(
      () => jsonResponse(422, { error: 'checksum_mismatch' }),
      t('files.upload.error.checksum'),
    );
  });

  it('413 → files.upload.error.tooLarge，唔當成功', async () => {
    await expectUploadMessage(
      () => jsonResponse(413, { error: 'payload_too_large' }),
      t('files.upload.error.tooLarge'),
    );
  });

  it('401 → admin.sessionExpired', async () => {
    await expectUploadMessage(
      () => jsonResponse(401, { error: 'unauthorized' }),
      t('admin.sessionExpired'),
    );
  });

  it('網絡失敗 → error.network', async () => {
    await expectUploadMessage(
      () => Promise.reject(new Error('offline')),
      t('error.network'),
    );
  });

  it('其他未預期錯誤 → error.unexpected', async () => {
    await expectUploadMessage(() => jsonResponse(500, { error: 'boom' }), t('error.unexpected'));
  });

  it('403 password_change_required 沿用全站導向帳戶頁，唔當權限不足', async () => {
    const selected = new File(['hello'], 'a.txt', { type: 'text/plain' });
    openFiles({ filesUpload: () => jsonResponse(403, { error: 'password_change_required' }) });
    await waitForPage();
    await selectAndUpload(selected);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/account');
    });
    expect(document.querySelector('[data-files-page]')).toBeNull();
  });
});

describe('檔案頁：下載同刪除', () => {
  it('下載連結 href／target／rel 正確', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    openFiles({ filesList: () => jsonResponse(200, { files: [file({ id })], nextCursor: null }) });
    await waitRows(1);

    const link = document.querySelector<HTMLAnchorElement>('[data-files-download]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(`/api/files/${id}`);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('刪除確認文案含「仍保留」同軟刪除', async () => {
    openFiles({ filesList: () => jsonResponse(200, { files: [file()], nextCursor: null }) });
    await waitRows(1);
    await userEvent.click(
      within(rows()[0] as HTMLElement).getByRole('button', { name: t('files.delete.action') }),
    );
    const dialog = await screen.findByRole('dialog');
    const text = dialog.textContent ?? '';
    expect(text).toContain(t('files.delete.confirm.body'));
    expect(text).toContain('仍保留');
    expect(text).toContain('軟刪除');
  });

  it('刪除成功（204）後重新讀取第一頁', async () => {
    const api = openFiles({
      filesList: () => jsonResponse(200, { files: [file()], nextCursor: null }),
      filesDelete: () => jsonResponse(204, null),
    });
    await waitRows(1);
    await userEvent.click(
      within(rows()[0] as HTMLElement).getByRole('button', { name: t('files.delete.action') }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t('files.delete.confirm.action'),
      }),
    );

    await waitFor(() => {
      expect(api.count('filesDelete')).toBe(1);
    });
    await waitFor(() => {
      expect(api.count('filesList')).toBe(2);
    });
    expect(document.querySelector('[data-files-notice]')?.textContent).toContain(
      t('files.delete.success'),
    );
  });

  it('刪除 404 顯示 files.delete.notFound 並重新讀取', async () => {
    const api = openFiles({
      filesList: () => jsonResponse(200, { files: [file()], nextCursor: null }),
      filesDelete: () => jsonResponse(404, { error: 'not_found' }),
    });
    await waitRows(1);
    await userEvent.click(
      within(rows()[0] as HTMLElement).getByRole('button', { name: t('files.delete.action') }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t('files.delete.confirm.action'),
      }),
    );

    await waitFor(() => {
      expect(document.querySelector('[data-files-notice]')?.textContent).toContain(
        t('files.delete.notFound'),
      );
    });
    await waitFor(() => {
      expect(api.count('filesList')).toBe(2);
    });
  });
});

describe('檔案頁：檔名純文字同靜態紀律', () => {
  it('檔名含 <img src=x onerror=...> 只顯示文字，唔建立元素', async () => {
    const evil = '<img src=x onerror=alert(1)>.txt';
    openFiles({
      filesList: () =>
        jsonResponse(200, { files: [file({ originalName: evil })], nextCursor: null }),
    });
    await waitRows(1);

    const cell = document.querySelector<HTMLElement>('[data-files-name]');
    expect(cell?.textContent).toBe(evil);
    expect(cell?.innerHTML).not.toContain('<img');
    expect(document.querySelectorAll('[data-files-page] img').length).toBe(0);
    expect(screen.getByText(evil)).toBeTruthy();
  });

  it('apps/web/src 內唔出現 209715200 或 200 MiB 字面值', () => {
    const offenders = listSources(webSrc)
      .filter((source) => /209715200|200 MiB/.test(readFileSync(source, 'utf8')))
      .map((source) => relative(repoRoot, source));
    expect(offenders).toEqual([]);
  });

  it('FilesScreen.tsx 唔用 localStorage、dangerouslySetInnerHTML、overflow hidden', () => {
    const source = readFileSync(resolve(webSrc, 'screens/FilesScreen.tsx'), 'utf8');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source).not.toContain('overflow: hidden');
  });
});
