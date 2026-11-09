import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import {
  deleteFile,
  fetchFiles,
  fileDownloadUrl,
  submitLogout,
  uploadFile,
  type ApiFailure,
  type PublicFile,
  type PublicUser,
} from '../api';
import { FrameApps } from '../frame/FrameApps';
import { MAIN_NAV_ROUTE, mainNavItems, type MainNavKey } from '../frame/nav';
import { useFrameChrome } from '../frame/useFrameChrome';
import { navigate } from '../router';

/**
 * 檔案頁（issue 164／F-06）。只接已完成嘅五條檔案端點，唔改後端。
 *
 * 幾條底線：
 * 1. **清單只有一個來源**：`GET /files`，前端唔排次序、唔存副本、唔寫入
 *    瀏覽器本機儲存。每次寫入成功後重新讀取第一頁；`nextCursor` 原样帶去
 *    下一頁，結果接落列表尾。
 * 2. **上傳 body 係原始 `File`**：唔字串化、唔 base64、唔送校驗標頭，
 *    亦唔宣稱已校驗。角色只影響文案，唔影響請求。
 * 3. **檔名一律純文字**：React 文字節點，唔把字串當 HTML 解讀，唔預覽內容。
 * 4. **失敗講真話**：讀取失敗同空清單係兩件事；七種上傳失敗各自顯示；
 *    403 `password_change_required` 沿用全站導向帳戶頁，唔當權限不足。
 * 5. **唔硬編上傳上限**：413 由伺服器回應處理，前端唔寫死任何數字。
 */

const PAGE_LIMIT = 50;

const COLUMNS: readonly MessageKey[] = [
  'files.column.name',
  'files.column.type',
  'files.column.size',
  'files.column.uploadedAt',
  'files.column.checksum',
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; files: PublicFile[]; nextCursor: string | null }
  | { kind: 'failed'; message: string };

type Notice = { kind: 'done' | 'failed'; message: string } | null;

/** 403 唔係權限不足；全站一致帶去個人帳戶頁改密碼。 */
function isPasswordChangeRequired(failure: ApiFailure): boolean {
  return (
    failure.kind === 'http' &&
    failure.status === 403 &&
    failure.error === 'password_change_required'
  );
}

function loadFailureMessage(failure: ApiFailure): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  if (failure.status === 401) {
    return t('admin.sessionExpired');
  }

  return t('files.loadFailed');
}

/** 七種上傳失敗各自對應一句話，唔摺成一句「失敗」。 */
function uploadFailureMessage(failure: ApiFailure): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  if (failure.status === 400 && failure.error === 'invalid_content_type') {
    return t('files.upload.error.invalidType');
  }

  if (failure.status === 400 && failure.error === 'invalid_file_name') {
    return t('files.upload.error.invalidName');
  }

  if (failure.status === 422 && failure.error === 'checksum_mismatch') {
    return t('files.upload.error.checksum');
  }

  if (failure.status === 413) {
    return t('files.upload.error.tooLarge');
  }

  if (failure.status === 401) {
    return t('admin.sessionExpired');
  }

  return t('error.unexpected');
}

function deleteFailureMessage(failure: ApiFailure): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  if (failure.status === 401) {
    return t('admin.sessionExpired');
  }

  return t('error.unexpected');
}

/** 四個帶 {count} 嘅鍵一律傳齊變數；單語系缺變數會喺 t() 入面拋錯。 */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) {
    return t('files.size.bytes', { count: bytes });
  }

  if (bytes < 1024 * 1024) {
    return t('files.size.kb', { count: Math.round(bytes / 1024) });
  }

  if (bytes < 1024 * 1024 * 1024) {
    return t('files.size.mb', { count: Math.round(bytes / (1024 * 1024)) });
  }

  return t('files.size.gb', { count: Math.round(bytes / (1024 * 1024 * 1024)) });
}

function formatAt(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-HK', { dateStyle: 'short', timeStyle: 'short' });
}

export type FilesScreenProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

export function FilesScreen({ user, onSignedOut }: FilesScreenProps) {
  const chrome = useFrameChrome();
  const isOwner = user.role === 'owner';

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });

    void fetchFiles({ limit: PAGE_LIMIT }).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setLoad({
          kind: 'ready',
          files: result.data.files,
          nextCursor: result.data.nextCursor,
        });

        return;
      }

      if (isPasswordChangeRequired(result.failure)) {
        navigate('/account');

        return;
      }

      setLoad({ kind: 'failed', message: loadFailureMessage(result.failure) });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // 刪除對話框：開啟時焦點入對話框，Escape 由文件層級收。
  useEffect(() => {
    if (deleteTarget === null) {
      return;
    }

    deleteDialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDeleteTarget(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [deleteTarget]);

  async function handleSignOut(): Promise<void> {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    const result = await submitLogout();

    if (result.ok) {
      onSignedOut();

      return;
    }

    setSigningOut(false);
    setNotice({
      kind: 'failed',
      message: result.failure.kind === 'network' ? t('error.network') : t('error.unexpected'),
    });
  }

  async function submitUpload(): Promise<void> {
    if (selected === null || uploading) {
      return;
    }

    setUploading(true);
    setNotice(null);

    const result = await uploadFile(selected);

    setUploading(false);

    if (!result.ok) {
      if (isPasswordChangeRequired(result.failure)) {
        navigate('/account');

        return;
      }

      setNotice({ kind: 'failed', message: uploadFailureMessage(result.failure) });

      return;
    }

    setSelected(null);

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }

    setNotice({ kind: 'done', message: t('files.upload.success') });
    setReloadKey((key) => key + 1);
  }

  async function loadMore(): Promise<void> {
    if (load.kind !== 'ready' || load.nextCursor === null || moreBusy) {
      return;
    }

    const cursor = load.nextCursor;
    setMoreBusy(true);

    const result = await fetchFiles({ limit: PAGE_LIMIT, cursor });

    setMoreBusy(false);

    if (!result.ok) {
      if (isPasswordChangeRequired(result.failure)) {
        navigate('/account');

        return;
      }

      setNotice({ kind: 'failed', message: loadFailureMessage(result.failure) });

      return;
    }

    const page = result.data;

    setLoad((previous) => {
      if (previous.kind !== 'ready') {
        return previous;
      }

      const seen = new Set(previous.files.map((item) => item.id));
      const appended = page.files.filter((item) => !seen.has(item.id));

      return {
        kind: 'ready',
        files: [...previous.files, ...appended],
        nextCursor: page.nextCursor,
      };
    });
  }

  async function confirmDelete(): Promise<void> {
    const target = deleteTarget;

    if (target === null || deleting) {
      return;
    }

    setDeleting(true);
    setNotice(null);

    const result = await deleteFile(target.id);

    setDeleting(false);
    setDeleteTarget(null);

    if (!result.ok) {
      if (isPasswordChangeRequired(result.failure)) {
        navigate('/account');

        return;
      }

      if (result.failure.kind === 'http' && result.failure.status === 404) {
        setNotice({ kind: 'failed', message: t('files.delete.notFound') });
        setReloadKey((key) => key + 1);

        return;
      }

      setNotice({ kind: 'failed', message: deleteFailureMessage(result.failure) });

      return;
    }

    setNotice({ kind: 'done', message: t('files.delete.success') });
    setReloadKey((key) => key + 1);
  }

  function renderRow(item: PublicFile) {
    return (
      <tr key={item.id} data-files-row={item.id}>
        <td className="files-cell files-cell--name">
          <span className="files-name" data-files-name>
            {item.originalName}
          </span>
          <span className="files-actions">
            <a
              className="button button--text"
              data-files-download
              href={fileDownloadUrl(item.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('files.download.action')}
            </a>
            <button
              type="button"
              className="button button--text"
              disabled={deleting}
              onClick={() => setDeleteTarget(item)}
            >
              {t('files.delete.action')}
            </button>
          </span>
        </td>
        <td className="files-cell" data-files-type>
          {item.contentType}
        </td>
        <td className="files-cell" data-files-size>
          {sizeLabel(item.sizeBytes)}
        </td>
        <td className="files-cell" data-files-at>
          {formatAt(item.createdAt)}
        </td>
        <td className="files-cell files-cell--checksum" data-files-checksum>
          {item.sha256}
        </td>
      </tr>
    );
  }

  return (
    <FrameApps
      moduleTabs={mainNavItems(isOwner)}
      currentModuleTabKey="files"
      onSelectModuleTab={(key) => {
        const route = MAIN_NAV_ROUTE[key as MainNavKey];

        if (route !== undefined) {
          navigate(route);
        }
      }}
      theme={chrome.theme}
      onToggleTheme={chrome.onToggleTheme}
      account={{ displayName: user.displayName, signingOut }}
      onSignOut={() => void handleSignOut()}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      modulePages={[]}
      currentPageKey={null}
      onSelectPage={() => undefined}
    >
      <div className="page page--wide files" data-files-page>
        <div className="page__head">
          <h1 className="page__title">{t('files.title')}</h1>
          <p className="page__sub" data-files-lead>
            {t(isOwner ? 'files.lead.owner' : 'files.lead.staff')}
          </p>
        </div>

        <div className="files-upload">
          <label className="admin-field">
            <span className="admin-field__label">{t('files.upload.select')}</span>
            <input
              ref={fileInputRef}
              className="input"
              type="file"
              aria-label={t('files.upload.select')}
              disabled={uploading}
              onChange={(event) => {
                setSelected(event.target.files?.[0] ?? null);
                setNotice(null);
              }}
            />
          </label>
          <button
            type="button"
            className="button button--primary"
            data-files-upload
            disabled={uploading || selected === null}
            onClick={() => void submitUpload()}
          >
            {uploading ? t('files.upload.uploading') : t('files.upload.action')}
          </button>
        </div>

        {notice !== null && (
          <div
            className={`admin-notice ${notice.kind === 'failed' ? 'admin-notice--failed' : ''}`}
            role={notice.kind === 'failed' ? 'alert' : 'status'}
            data-files-notice
          >
            <p className="admin-notice__text">{notice.message}</p>
          </div>
        )}

        {load.kind === 'loading' && (
          <p className="admin-status" role="status" data-files-loading>
            {t('status.loading')}
          </p>
        )}

        {load.kind === 'failed' && (
          <div className="admin-notice admin-notice--failed" role="alert" data-files-failed>
            <p className="admin-notice__text">{load.message}</p>
            <button
              type="button"
              className="button button--text admin-notice__action"
              data-files-retry
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {t('admin.retry')}
            </button>
          </div>
        )}

        {load.kind === 'ready' &&
          (load.files.length === 0 ? (
            <p className="page__empty" data-files-empty>
              {t(isOwner ? 'files.empty.owner' : 'files.empty.staff')}
            </p>
          ) : (
            <>
              <div className="files-table-wrap">
                <table className="files-table">
                  <thead>
                    <tr>
                      {COLUMNS.map((key) => (
                        <th key={key} scope="col">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{load.files.map(renderRow)}</tbody>
                </table>
              </div>

              <p className="files-note">{t('files.download.note')}</p>
              <p className="files-note">{t('files.checksum.note')}</p>

              <div className="files-pagination">
                {load.nextCursor !== null ? (
                  <button
                    type="button"
                    className="button button--text"
                    data-files-more
                    disabled={moreBusy}
                    onClick={() => void loadMore()}
                  >
                    {t('files.loadMore')}
                  </button>
                ) : (
                  <p className="files-end" data-files-end>
                    {t('files.endOfList')}
                  </p>
                )}
              </div>
            </>
          ))}
      </div>

      {deleteTarget !== null && (
        <div className="admin-scrim">
          <div
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="files-delete-title"
            data-files-delete-dialog
            tabIndex={-1}
            ref={deleteDialogRef}
          >
            <h2 className="admin-dialog__title" id="files-delete-title">
              {t('files.delete.confirm.title')}
            </h2>
            <p className="admin-dialog__body">{t('files.delete.confirm.body')}</p>
            <div className="admin-dialog__actions">
              <button
                type="button"
                className="button button--text"
                onClick={() => setDeleteTarget(null)}
              >
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? t('files.delete.deleting') : t('files.delete.confirm.action')}
              </button>
            </div>
          </div>
        </div>
      )}
    </FrameApps>
  );
}
