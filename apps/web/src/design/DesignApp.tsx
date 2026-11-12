import { useState, type ReactNode } from 'react';
import { t } from '@company-os/i18n';
import { createBrand, type BrandItem, type PublicUser } from '../api';
import { AppFrame } from '../frame/AppFrame';
import {
  DESIGN_NAV,
  navLabel,
  pageApiKey,
  resolveNav,
  withBrandPages,
  type NavPosition,
} from '../frame/appNav';
import { useBrands, useSelectedBrand } from '../frame/useDirectory';
import { navigatePath, useHashPath } from '../router';
import { BrandPageCreate } from './BrandPageCreate';
import { BrandPageScreen } from './BrandPageScreen';
import { useBrandPages } from './useBrandPages';

/**
 * Design app（設計／內容／網站）。
 *
 * 四個模組：品牌、素材、知識、創作（老闆 2026-11-10：呢四個就係
 * Marketing Design app 的模組）。
 *
 * 品牌模組的形狀由 issue #32 定：
 *   - 左側是**這個品牌的一組頁**：品牌主頁、標誌、色彩、字體、語氣，加上
 *     零到多張自定義頁。不是儀表板、不是渠道、不是版本紀錄 —— 版本住在
 *     每一頁自己裡面（#33）。
 *   - 第一格是品牌主頁。它的內容由 #39 交付；未交付就講未交付，不畫假總覽。
 *   - 品牌清單不在這裡：它住在頂欄的品牌切換。一間公司還未開第一個品牌時，
 *     這裡講明「只有老闆可以開第一個」，不是白畫面。
 *   - 自定義頁的鍵是 `p/<slug>`，網址 `#/design/brand/p/<slug>`，與五頁
 *     的 `#/design/brand/<鍵>` 永遠不會撞。
 *
 * 頁清單由 `useBrandPages` 讀一次，左側導覽與頁面都由它推出來。兩處各讀
 * 一次，早晚會出現「左側有四頁、頁籤有五頁」這種講不通的分別。
 */

type DesignAppProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

/** 未接內容的三個模組（素材、知識、創作）：如實講未接，不畫假表。 */
function DesignStub() {
  return (
    <div className="design-stub">
      <p className="design-stub__title">{t('design.stub.title')}</p>
      <p className="design-stub__body">{t('design.stub.body')}</p>
    </div>
  );
}

function NoBrand(props: { canCreate: boolean; onCreated: () => void }) {
  return (
    <div className="design-empty" data-brand-nobrand>
      <p className="design-empty__title">{t('brand.page.noBrand')}</p>
      <p className="design-empty__body">{t('brand.page.noBrandBody')}</p>

      {props.canCreate ? (
        <CreateBrandForm onCreated={props.onCreated} />
      ) : (
        // 唔畫一個按落去會 403 的表單：講錯原因比唔講更差。
        <p className="design-footnote" data-brand-create="owner-only">
          {t('design.brand.ownerOnly')}
        </p>
      )}
    </div>
  );
}

function CreateBrandForm(props: { onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (busy) {
      return;
    }

    const trimmedCode = code.trim().toLowerCase();
    const trimmedName = name.trim();

    if (trimmedCode.length === 0 || trimmedName.length === 0) {
      setError(t('design.brand.invalid'));
      return;
    }

    setError(null);
    setBusy(true);

    const result = await createBrand({ code: trimmedCode, name: trimmedName });

    setBusy(false);

    if (result.ok) {
      setCode('');
      setName('');
      props.onCreated();
      return;
    }

    if (result.failure.kind === 'http') {
      setError(
        result.failure.error === 'duplicate_code'
          ? t('design.brand.duplicate')
          : t('design.brand.invalid'),
      );
      return;
    }

    setError(t('design.brand.createFailed'));
  }

  return (
    <>
      <h2 className="design-form__heading">{t('design.brand.add')}</h2>

      <form
        className="design-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <label className="design-field">
          <span className="design-field__label">{t('design.brand.newCode')}</span>
          <input
            className="design-input"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            placeholder="moonic"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="design-field__hint">{t('design.brand.newCodeHint')}</span>
        </label>

        <label className="design-field">
          <span className="design-field__label">{t('design.brand.newName')}</span>
          <input
            className="design-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            autoComplete="off"
          />
        </label>

        {error !== null && (
          <p className="design-note design-note--error" role="alert">
            {error}
          </p>
        )}

        <div className="design-form__actions">
          <button type="submit" className="design-btn design-btn--primary" disabled={busy}>
            {t('design.brand.create')}
          </button>
        </div>
      </form>
    </>
  );
}

export function DesignApp({ user, onSignedOut }: DesignAppProps) {
  const path = useHashPath();
  const brands = useBrands(true);
  const items: readonly BrandItem[] = brands.state.kind === 'ready' ? brands.state.items : [];
  const { brandId } = useSelectedBrand(brands.state);
  const selected = items.find((item) => item.id === brandId) ?? null;
  const pages = useBrandPages(brandId);

  const nav = withBrandPages(
    DESIGN_NAV,
    pages.items.map((page) => ({
      key: page.key,
      name: page.name,
      kind: page.kind,
      group: page.group,
      missing: page.current === null,
    })),
  );

  /**
   * 品牌主頁過時之頁（#60）：主頁之後改過的頁。算出來，不存 flag。
   *
   * 主頁冇有版本而其他頁有＝一樣是過時：主頁由其他頁砌出來，它未有版本就
   * 代表從未反映過任何一頁。
   */
  const homeCurrent = pages.items.find((page) => page.key === 'home')?.current?.createdAt ?? null;
  const newerPages = pages.items
    .filter((page) => page.key !== 'home' && page.current !== null)
    .filter((page) => homeCurrent === null || page.current !== null && page.current.createdAt > homeCurrent)
    .map((page) => page.name);
  const position = resolveNav(nav, path);
  const inBrand = position.navModule.key === 'brand';

  const [panel, setPanel] = useState<'page' | 'brand' | null>(null);
  /**
   * 「已經幫你搬過去」的提示。連著它應該出現的那一條路徑一起存 —— 提示跟著
   * 目的地走，換了頁就自然消失，不會在品牌主頁上講一件已經過去的事。
   */
  const [moved, setMoved] = useState<{ text: string; at: string } | null>(null);

  // 網址上這一頁的鍵：自定義頁是 `p/<slug>`，佔兩段。
  const requestedKey = path[0] === 'brand' ? path.slice(1).join('/') : '';
  const pathKey = path.join('/');
  const pageMissing =
    pages.state.kind === 'ready' &&
    requestedKey.startsWith('p/') &&
    !pages.items.some((item) => `p/${item.key}` === requestedKey);

  function renderBrand(current: NavPosition): ReactNode {
    if (brandId === null) {
      return (
        <NoBrand
          canCreate={user.role === 'owner'}
          onCreated={() => {
            brands.reload();
          }}
        />
      );
    }

    if (pages.state.kind === 'loading' || pages.state.kind === 'idle') {
      return <p className="design-empty">{t('brand.page.manage.loading')}</p>;
    }

    if (pages.state.kind === 'failed') {
      return (
        <div className="design-empty" data-brand-pages-failed>
          <p>{t('brand.page.manage.loadFailed')}</p>
          <button type="button" className="design-btn" onClick={pages.reload}>
            {t('common.retry')}
          </button>
        </div>
      );
    }

    if (pageMissing) {
      return (
        <p className="design-empty" data-brand-page-missing>
          {t('brand.page.manage.missingPage')}
        </p>
      );
    }

    return (
      <BrandPageScreen
        brandId={brandId}
        pageKey={pageApiKey(current.page.key)}
        canEdit={pages.canEdit}
        isOwner={user.role === 'owner'}
        brandName={selected?.name ?? null}
        onPagesChanged={pages.reload}
        newerPages={newerPages}
        onRemoved={() => {
          pages.reload();
          navigatePath('/design', 'brand', 'home');
        }}
      />
    );
  }

  function renderPage(current: NavPosition): ReactNode {
    if (current.navModule.key !== 'brand') {
      return <DesignStub />;
    }

    return renderBrand(current);
  }

  const headerActions =
    inBrand && (user.role === 'owner' || pages.canEdit) ? (
      <div className="design-actions">
        {pages.canEdit && brandId !== null && (
          <button
            type="button"
            className="design-btn"
            data-brand-page-create-open
            onClick={() => {
              setMoved(null);
              setPanel((open) => (open === 'page' ? null : 'page'));
            }}
          >
            {t('brand.page.manage.new')}
          </button>
        )}

        {/* 只有老闆可以開新品牌（後端 `POST /brands` 已經是 requireOwner）。 */}
        {user.role === 'owner' && (
          <button
            type="button"
            className="design-btn design-btn--primary"
            onClick={() => {
              setPanel((open) => (open === 'brand' ? null : 'brand'));
            }}
          >
            {t('design.brand.add')}
          </button>
        )}
      </div>
    ) : undefined;

  return (
    <AppFrame
      nav={nav}
      user={user}
      path={path}
      onSignOut={onSignedOut}
      pageTitle={navLabel(position.page)}
      pageSubtitle={inBrand && selected !== null ? selected.name : undefined}
      {...(headerActions === undefined ? {} : { primaryAction: headerActions })}
    >
      {(current: NavPosition) => (
        <>
          {/* 加頁時選了「其實屬於某一頁」：不開新頁，帶去那一頁並講明原因。 */}
          {moved !== null && moved.at === pathKey && (
            <p className="design-note" role="status" data-brand-page-moved>
              {moved.text}
            </p>
          )}

          {panel === 'page' && brandId !== null && (
            <BrandPageCreate
              brandId={brandId}
              pages={pages.items}
              onClose={() => {
                setPanel(null);
              }}
              onMoved={(key, name) => {
                setPanel(null);
                setMoved({ text: t('brand.page.manage.belongsMoved', { name }), at: `brand/${key}` });
                navigatePath('/design', 'brand', key);
              }}
              onCreated={(name, key) => {
                setPanel(null);
                pages.reload();
                setMoved({
                  text: t('brand.page.manage.created', { name }),
                  at: `brand/p/${key}`,
                });
                navigatePath('/design', 'brand', 'p', key);
              }}
            />
          )}

          {panel === 'brand' && (
            <section className="brand-manage" data-brand-create-panel>
              <CreateBrandForm
                onCreated={() => {
                  setPanel(null);
                  brands.reload();
                }}
              />
            </section>
          )}

          {renderPage(current)}
        </>
      )}
    </AppFrame>
  );
}
