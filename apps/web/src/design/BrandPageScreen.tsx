import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  deleteBrandPage,
  deleteBrandPageVersion,
  fetchBrandPage,
  renameBrandPage,
  restoreBrandPageVersion,
  saveBrandPageVersion,
  type BrandPageDetail,
  type BrandPageVersionSummary,
} from '../api';
import { failureMessage } from './apiFailure';
import { BrandColorEditor } from './BrandColorEditor';
import { BrandLogoEditor } from './BrandLogoEditor';
import { BrandTypeEditor } from './BrandTypeEditor';
import { hexesInText } from './brandColors';
import { assetNamesInText } from './brandLogo';
import { namesInText } from './brandType';

/**
 * 一頁品牌頁的時間軸（issue #33），加上自定義頁的改名與刪除（issue #32）。
 *
 * 這一頁做的事只有一件：讓「現行」與「舊版」同時看得見，並且讓每一下改動
 * 都留下一版。它不是編輯器 —— 內容怎樣生成是各頁自己的 issue（#35–#39）；
 * 這裡的輸入框是**儲存通道**，先把版本鏈接好，之後每一頁接手同一個通道。
 *
 * 三個誠實位：
 *   1. 未有版本就講「未有版本」，不畫一個空白的「第 1 版」。
 *   2. 現行版本沒有刪除鍵 —— 不是變灰，而是不出現。變灰會令人以為等一等就可以。
 *   3. 被拒絕時原樣講伺服器那句（現行／被成品釘住／找不到），不自創理由。
 *
 * 頁清單不在這裡畫（issue #32）：左側欄就是清單，這裡再列一次只會出現兩個
 * 「這個品牌有哪幾頁」的答案。改名與刪頁仍在這裡，因為那是「這一頁」的事。
 */

type LoadState = 'loading' | 'ready' | 'missing' | 'failed';

type BrandPageScreenProps = {
  brandId: string;
  /** 後端路徑上的頁鍵：固定頁是 `logo`，自定義頁是它的 slug。 */
  pageKey: string;
  /** 只有可以改這個品牌的人見到寫入介面（品牌級授權見 #32）。 */
  canEdit: boolean;
  /** 改名之後叫上層重讀清單：左側的名要跟著變。 */
  onPagesChanged: () => void;
  /** 刪完之後回品牌主頁：留在一個已經不存在的網址上只會見到「找不到」。 */
  onRemoved: () => void;
};

/**
 * 色彩頁的版本預覽：用色點代替原始 JSON。
 *
 * 版本列表只拿到 160 字元的截斷內容，解析不到，但仍然數得出那一版有幾個色。
 * 直接印 JSON 等於叫人讀程式碼；一個點都抽不到就講「抽不到」，不畫假色。
 */
function ColorVersionPreview({ preview }: { preview: string }) {
  const hexes = hexesInText(preview).slice(0, 12);

  if (hexes.length === 0) {
    return <p className="brand-page__preview">{t('brand.color.versionNoSwatch')}</p>;
  }

  return (
    <span className="brand-page__swatches" data-color-version-swatches>
      {hexes.map((hex) => (
        <span
          key={hex}
          className="brand-page__swatch"
          style={{ backgroundColor: hex }}
          data-color-version-swatch={hex}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * 字體頁的版本預覽：家族名，不印 JSON。
 *
 * 版本列表只拿到 160 字元的截斷內容，解析不到；但家族名寫在 JSON 最前面，
 * 所以抽得到。抽不到就講「未有可供顯示的家族名」，不畫假的。
 */
function TypeVersionPreview({ preview }: { preview: string }) {
  const names = namesInText(preview).slice(0, 3);

  if (names.length === 0) {
    return <p className="brand-page__preview">{t('brand.type.versionNoName')}</p>;
  }

  return (
    <span className="brand-page__families" data-type-version-names>
      {names.map((name) => (
        <span className="brand-page__familyChip" key={name} data-type-version-name={name}>
          {name}
        </span>
      ))}
    </span>
  );
}

/**
 * 標誌頁的版本預覽：資產名，不印 JSON。
 *
 * 版本列表只拿到 160 字元的截斷內容；資產名寫在 JSON 最前面，所以抽得到。
 * 抽不到就講抽不到 —— 不會畫一個假標誌出來。
 */
function LogoVersionPreview({ preview }: { preview: string }) {
  const names = assetNamesInText(preview).slice(0, 5);

  if (names.length === 0) {
    return <p className="brand-page__preview">{t('brand.logo.versionNoName')}</p>;
  }

  return (
    <span className="brand-page__assets" data-logo-version-names>
      {names.map((name) => (
        <span className="brand-page__assetChip" key={name} data-logo-version-name={name}>
          {name}
        </span>
      ))}
    </span>
  );
}

function formatTime(value: string): string {  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BrandPageScreen({
  brandId,
  pageKey,
  canEdit,
  onPagesChanged,
  onRemoved,
}: BrandPageScreenProps) {
  const [detail, setDetail] = useState<BrandPageDetail | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    setState('loading');

    const page = await fetchBrandPage(brandId, pageKey);

    if (!page.ok) {
      if (page.failure.kind === 'http' && page.failure.status === 404) {
        setState('missing');
        return;
      }

      setState('failed');
      return;
    }

    setDetail(page.data);
    setDraft(page.data.current?.content ?? '');
    setNameDraft(page.data.page.name);
    setState('ready');
  }, [brandId, pageKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave(): Promise<void> {
    if (busy) {
      return;
    }

    if (draft.trim() === '') {
      setError(
        pageKey === 'color'
          ? t('brand.color.empty')
          : pageKey === 'type'
            ? t('brand.type.empty')
            : pageKey === 'logo'
              ? t('brand.logo.empty')
              : t('brand.page.emptyContent'),
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await saveBrandPageVersion(brandId, pageKey, { content: draft });

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.saveFailed')));
      return;
    }

    setNotice(t('brand.page.saved', { no: result.data.version.versionNo }));
    await reload();
  }

  async function handleRestore(version: BrandPageVersionSummary): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await restoreBrandPageVersion(brandId, pageKey, version.id);

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.actionFailed')));
      return;
    }

    setNotice(
      t('brand.page.restored', {
        source: version.versionNo,
        no: result.data.version.versionNo,
      }),
    );
    await reload();
  }

  async function handleDelete(version: BrandPageVersionSummary): Promise<void> {
    if (busy) {
      return;
    }

    if (confirmDeleteId !== version.id) {
      setConfirmDeleteId(version.id);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmDeleteId(null);

    const result = await deleteBrandPageVersion(brandId, pageKey, version.id);

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.actionFailed')));
      return;
    }

    setNotice(t('brand.page.deleted', { no: result.data.versionNo }));
    await reload();
  }

  async function handleRename(): Promise<void> {
    if (busy) {
      return;
    }

    const next = nameDraft.trim();

    if (next === '') {
      setError(t('brand.page.manage.missing'));
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await renameBrandPage(brandId, pageKey, { name: next });

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.manage.renameFailed')));
      return;
    }

    setRenaming(false);
    setNotice(t('brand.page.manage.renamed', { name: result.data.page.name }));
    onPagesChanged();
    await reload();
  }

  async function handleRemove(): Promise<void> {
    if (busy) {
      return;
    }

    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await deleteBrandPage(brandId, pageKey);

    setBusy(false);
    setConfirmRemove(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.manage.removeFailed')));
      return;
    }

    onRemoved();
  }

  if (state === 'loading') {
    return <p className="design-empty">{t('brand.page.loading')}</p>;
  }

  if (state === 'missing') {
    return (
      <p className="design-empty" data-brand-page-missing>
        {t('brand.page.missing')}
      </p>
    );
  }

  if (state === 'failed' || detail === null) {
    return (
      <div className="design-empty" data-brand-page-failed>
        <p>{t('brand.page.loadFailed')}</p>
        <button
          type="button"
          className="design-btn"
          onClick={() => {
            void reload();
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const page = detail.page;
  const isCustom = page.kind === 'custom';

  return (
    <div className="brand-page" data-brand-page={page.key}>
      {/* 頁名不重複畫：外殼的頁標題就是同一個名（左側、頁籤、標題三者同源）。
          這裡只補外殼講不到的兩件事：這是自定義頁，以及現行是第幾版。 */}
      {(isCustom || detail.current !== null) && (
        <div className="brand-page__head">
          {isCustom && <span className="brand-page__tag">{t('brand.page.manage.customTag')}</span>}
          {detail.current !== null && (
            <p className="brand-page__meta">
              {t('brand.page.versionNo', { no: detail.current.versionNo })}
            </p>
          )}
        </div>
      )}

      {isCustom && page.brief !== null && (
        <p className="brand-page__brief" data-brand-page-brief>
          {t('brand.page.manage.briefLine', { brief: page.brief })}
        </p>
      )}

      {isCustom && canEdit && (
        <div className="brand-page__manage" data-brand-page-manage>
          {renaming ? (
            <div className="brand-page__rename">
              <label className="design-field__label" htmlFor="brand-page-rename">
                {t('brand.page.manage.name')}
              </label>
              <input
                id="brand-page-rename"
                className="design-input"
                value={nameDraft}
                autoComplete="off"
                onChange={(event) => {
                  setNameDraft(event.target.value);
                }}
              />
              <div className="brand-page__actions">
                <button
                  type="button"
                  className="brand-page__action"
                  disabled={busy}
                  onClick={() => {
                    void handleRename();
                  }}
                >
                  {t('brand.page.manage.renameSave')}
                </button>
                <button
                  type="button"
                  className="brand-page__action"
                  onClick={() => {
                    setRenaming(false);
                    setNameDraft(page.name);
                  }}
                >
                  {t('brand.page.manage.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="brand-page__actions">
              <button
                type="button"
                className="brand-page__action"
                data-brand-page-rename
                onClick={() => {
                  setNameDraft(page.name);
                  setRenaming(true);
                }}
              >
                {t('brand.page.manage.rename')}
              </button>

              <button
                type="button"
                className="brand-page__action brand-page__action--danger"
                disabled={busy}
                data-brand-page-remove
                onClick={() => {
                  void handleRemove();
                }}
              >
                {confirmRemove
                  ? t('brand.page.manage.removeConfirm')
                  : t('brand.page.manage.remove')}
              </button>
            </div>
          )}

          {/* slug 沒有欄位可改：不是變灰，是不存在。要搬就新建一張再刪舊那張。 */}
          <p className="design-field__hint">{t('brand.page.manage.slugFixed')}</p>
        </div>
      )}

      {notice !== null && (
        <p className="design-note" role="status" data-brand-page-notice>
          {notice}
        </p>
      )}

      {error !== null && (
        <p className="design-note design-note--error" role="alert" data-brand-page-error>
          {error}
        </p>
      )}

      {/* 色彩（#35）、字體（#38）、標誌（#36）用表，不用自由文字。三者共用
          同一個 draft 與同一個儲存鍵：在這裡分岔而不是另開一個畫面，版本
          列表、改名、刪頁就只有一份。 */}
      {pageKey === 'color' ? (
        <div className="brand-page__body" data-brand-page-body="color">
          <BrandColorEditor content={draft} canEdit={canEdit} onChange={setDraft} />
          {canEdit && <p className="design-field__hint">{t('brand.page.hint')}</p>}
        </div>
      ) : pageKey === 'type' ? (
        <div className="brand-page__body" data-brand-page-body="type">
          <BrandTypeEditor content={draft} canEdit={canEdit} onChange={setDraft} />
          {canEdit && <p className="design-field__hint">{t('brand.page.hint')}</p>}
        </div>
      ) : pageKey === 'logo' ? (
        <div className="brand-page__body" data-brand-page-body="logo">
          <BrandLogoEditor
            brandId={brandId}
            content={draft}
            canEdit={canEdit}
            onChange={setDraft}
          />
          {canEdit && <p className="design-field__hint">{t('brand.page.hint')}</p>}
        </div>
      ) : (
        <label className="brand-page__editor">
          <span className="design-field__label">{t('brand.page.editorLabel')}</span>
          <textarea
            className="brand-page__textarea"
            value={draft}
            readOnly={!canEdit}
            rows={10}
            spellCheck={false}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          {/* 只讀的人不應該讀到「每次儲存都會新增一版」—— 他儲存不了。
              唯讀的說明在下面那一句，兩句一起出就變成同一件事講兩次。 */}
          {canEdit && <span className="design-field__hint">{t('brand.page.hint')}</span>}
        </label>
      )}

      {canEdit ? (
        <div className="design-form__actions">
          <button
            type="button"
            className="design-btn design-btn--primary"
            data-brand-page-save
            disabled={busy || draft.trim() === ''}
            onClick={() => {
              void handleSave();
            }}
          >
            {busy ? t('brand.page.saving') : t('brand.page.save')}
          </button>
        </div>
      ) : (
        <p className="design-footnote" data-brand-page-readonly>
          {t('brand.page.readOnly')}
        </p>
      )}

      <section className="brand-page__versions" data-brand-page-versions>
        <h3 className="brand-page__versionsTitle">{t('brand.page.versions')}</h3>

        {detail.versions.length === 0 ? (
          <p className="design-empty">{t('brand.page.noVersion')}</p>
        ) : (
          <ul className="brand-page__list">
            {detail.versions.map((version) => {
              const isCurrent = detail.current?.id === version.id;

              return (
                <li
                  key={version.id}
                  className="brand-page__version"
                  data-brand-page-version={version.versionNo}
                  data-current={isCurrent ? 'true' : 'false'}
                >
                  <div className="brand-page__versionHead">
                    <span className="brand-page__versionNo">
                      {t('brand.page.versionNo', { no: version.versionNo })}
                    </span>
                    {isCurrent && (
                      <span className="brand-page__tag">{t('brand.page.currentTag')}</span>
                    )}
                    <span className="brand-page__time">{formatTime(version.createdAt)}</span>
                  </div>

                  {version.note !== null && (
                    <p className="brand-page__note">{version.note}</p>
                  )}

                  {pageKey === 'color' ? (
                    <ColorVersionPreview preview={version.preview} />
                  ) : pageKey === 'type' ? (
                    <TypeVersionPreview preview={version.preview} />
                  ) : pageKey === 'logo' ? (
                    <LogoVersionPreview preview={version.preview} />
                  ) : (
                    version.preview !== '' && (
                      <p className="brand-page__preview">{version.preview}</p>
                    )
                  )}

                  {/* 這一版是照第幾版策略做的（#34）。未記錄就講未記錄。 */}
                  <p className="brand-page__policy" data-brand-page-policy={version.versionNo}>
                    {version.policyVersionNo == null
                      ? t('brand.page.policyUnrecorded')
                      : t('brand.page.policyVersionNo', { no: version.policyVersionNo })}
                  </p>

                  {canEdit && !isCurrent && (
                    <div className="brand-page__actions">
                      <button
                        type="button"
                        className="brand-page__action"
                        disabled={busy}
                        data-brand-page-restore={version.versionNo}
                        onClick={() => {
                          void handleRestore(version);
                        }}
                      >
                        {t('brand.page.restore')}
                      </button>

                      <button
                        type="button"
                        className="brand-page__action brand-page__action--danger"
                        disabled={busy}
                        data-brand-page-delete={version.versionNo}
                        onClick={() => {
                          void handleDelete(version);
                        }}
                      >
                        {confirmDeleteId === version.id
                          ? t('brand.page.deleteConfirm')
                          : t('brand.page.delete')}
                      </button>
                    </div>
                  )}

                  {canEdit && isCurrent && (
                    <p className="brand-page__currentNote">{t('brand.page.currentBlocked')}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
