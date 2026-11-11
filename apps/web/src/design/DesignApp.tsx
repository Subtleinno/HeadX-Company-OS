import { useState } from 'react';
import { t } from '@company-os/i18n';
import { createBrand, type BrandItem, type PublicUser } from '../api';
import { AppFrame } from '../frame/AppFrame';
import { DESIGN_NAV, resolveNav, type NavPosition } from '../frame/appNav';
import { useBrands, useSelectedBrand } from '../frame/useDirectory';
import { useHashPath } from '../router';

/**
 * Design app（設計／內容／網站）。
 *
 * 四個模組：品牌、素材、知識、創作（老闆 2026-11-10：呢四個就係
 * Marketing Design app 的模組）。模組之下嘅頁全部喺左側欄，頁之下仲有章節
 * （品牌設定 → 品牌標誌／品牌識別／色彩／字體）。
 *
 * 而家只接好品牌這一條：品牌清單同新增品牌係真資料、真寫入。其餘三頁
 * 顯示如實嘅「未接」——唔會畫一個假表出來充場面，因為假表會令人以為
 * 功能已有，然後喺要交貨嗰日才發現入唔到數。
 */

type DesignAppProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

function DesignStub() {
  return (
    <div className="design-stub">
      <p className="design-stub__title">{t('design.stub.title')}</p>
      <p className="design-stub__body">{t('design.stub.body')}</p>
    </div>
  );
}

function BrandList(props: { items: readonly BrandItem[]; currentId: string | null }) {
  return (
    <ul className="design-brands">
      {props.items.map((item) => (
        <li
          key={item.id}
          className="design-brands__item"
          data-brand-row
          data-brand-current={item.id === props.currentId ? 'true' : 'false'}
        >
          <span className="design-brands__name">{item.name}</span>
          <span className="design-brands__code">{item.code}</span>
        </li>
      ))}
    </ul>
  );
}

function BrandHome(props: {
  items: readonly BrandItem[];
  currentId: string | null;
  /** 只有老闆可以開新品牌（issue #19）。後端 `POST /brands` 已經係 requireOwner。 */
  canCreate: boolean;
  onCreated: () => void;
}) {
  return (
    <>
      {props.items.length === 0 ? (
        <p className="design-empty">{t('design.brand.empty')}</p>
      ) : (
        <BrandList items={props.items} currentId={props.currentId} />
      )}

      {props.canCreate ? (
        <CreateBrandForm onCreated={props.onCreated} />
      ) : (
        // 唔畫一個按落去會 403 的表單：先假裝你可以做，再把拒絕講成
        // 「代碼格式有問題」，係講錯原因。如實講邊個可以開。
        <p className="design-note" data-brand-create="owner-only">
          {t('design.brand.ownerOnly')}
        </p>
      )}
    </>
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
  const position = resolveNav(DESIGN_NAV, path);
  const brands = useBrands(true);
  const items = brands.state.kind === 'ready' ? brands.state.items : [];
  const { brandId } = useSelectedBrand(brands.state);
  const selected = items.find((item) => item.id === brandId) ?? null;

  function renderPage(current: NavPosition) {
    if (current.page.key === 'home') {
      return (
        <BrandHome
          items={items}
          currentId={brandId}
          // 只看 role，不看 department：老闆唔屬任何部門，但仍然係唯一可以開品牌的人。
          canCreate={user.role === 'owner'}
          onCreated={() => {
            brands.reload();
          }}
        />
      );
    }

    return <DesignStub />;
  }

  const subtitle =
    position.page.key === 'home'
      ? t('design.brand.homeLead')
      : selected === null
        ? undefined
        : t('design.brand.lead', { brand: selected.name });

  return (
    <AppFrame
      nav={DESIGN_NAV}
      user={user}
      path={path}
      onSignOut={onSignedOut}
      pageTitle={t(position.section?.labelKey ?? position.page.labelKey)}
      {...(subtitle === undefined ? {} : { pageSubtitle: subtitle })}
    >
      {(current: NavPosition) => renderPage(current)}
    </AppFrame>
  );
}
