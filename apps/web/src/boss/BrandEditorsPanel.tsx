import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  fetchBrandEditors,
  grantBrandEditor,
  revokeBrandEditor,
  type BrandEditor,
  type StaffMember,
} from '../api';
import { useBrands } from '../frame/useDirectory';

/**
 * 誰可以改這個品牌的頁（issue #32 第 11 點）。
 *
 * 這是 **(品牌, 人)** 一對的授權，不是職位、不是部門、不是新 role：被勾選的
 * 人 `role` 仍然是 staff，只是多了一條「可以寫入這個品牌的頁」。加了幾張
 * 自定義頁都一樣涵蓋，因為授權掛在品牌上，不是逐頁。
 *
 * 老闆不在名單裡：他永遠可以改。把他寫進這張表只會出現「老闆被移除了編輯權」
 * 這種講不通的狀態，所以後端根本不存他，這裡也講明。
 *
 * 勾選即儲存（不做一個「儲存」按鈕）：一次只改一個人、一個品牌，加一步確認
 * 只會令人以為未儲存。失敗就把勾選還原成真正的事實，並講清楚原因。
 */

type EditorsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: BrandEditor[] }
  | { kind: 'failed' };

export type BrandEditorsPanelProps = {
  /** 人員表上的人（同一份名單，不另外讀一次）。 */
  staff: readonly StaffMember[];
};

export function BrandEditorsPanel({ staff }: BrandEditorsPanelProps) {
  const brands = useBrands(true);
  const items = brands.state.kind === 'ready' ? brands.state.items : [];
  const [brandId, setBrandId] = useState('');
  const [state, setState] = useState<EditorsState>({ kind: 'idle' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 品牌載入之後預設第一個：不預設就永遠要老闆先揀一次，而多數公司只有一個品牌。
  useEffect(() => {
    if (brandId === '' && items.length > 0) {
      setBrandId(items[0]?.id ?? '');
    }
  }, [brandId, items]);

  const load = useCallback(async (target: string): Promise<void> => {
    if (target === '') {
      setState({ kind: 'idle' });
      return;
    }

    setState({ kind: 'loading' });

    const result = await fetchBrandEditors(target);

    setState(result.ok ? { kind: 'ready', items: result.data.items } : { kind: 'failed' });
  }, []);

  useEffect(() => {
    setError(null);
    setNotice(null);
    void load(brandId);
  }, [brandId, load]);

  async function toggle(member: StaffMember, granted: boolean): Promise<void> {
    if (brandId === '' || busyId !== null) {
      return;
    }

    setBusyId(member.id);
    setError(null);
    setNotice(null);

    const result = granted
      ? await revokeBrandEditor(brandId, member.id)
      : await grantBrandEditor(brandId, member.id);

    setBusyId(null);

    if (!result.ok) {
      setError(t('boss.members.brandEditFailed'));
      return;
    }

    setState({ kind: 'ready', items: result.data.items });
    setNotice(
      granted
        ? t('boss.members.brandEditRevoked', { name: member.displayName })
        : t('boss.members.brandEditGranted', { name: member.displayName }),
    );
  }

  const editors = state.kind === 'ready' ? state.items : [];

  return (
    <section className="boss-form brand-editors-panel" data-brand-editors>
      <h2 className="boss-form__step">{t('boss.members.brandEditTitle')}</h2>
      <p className="boss-sites-card__note">{t('boss.members.brandEditLead')}</p>

      {items.length === 0 ? (
        <p className="boss-note" data-brand-editors-none>
          {t('boss.members.brandEditNone')}
        </p>
      ) : (
        <>
          <div className="boss-field">
            <label className="boss-field__label" htmlFor="brand-editors-brand">
              {t('boss.members.brandEditBrand')}
            </label>
            <select
              id="brand-editors-brand"
              className="boss-input boss-select"
              value={brandId}
              onChange={(event) => {
                setBrandId(event.target.value);
              }}
            >
              {items.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <p className="boss-sites-card__note">{t('boss.members.brandEditOwner')}</p>

          {state.kind === 'loading' && (
            <p className="boss-note" role="status">
              {t('boss.members.brandEditLoading')}
            </p>
          )}

          {state.kind === 'failed' && (
            <p className="boss-note boss-note--error" role="alert">
              {t('boss.members.brandEditLoadFailed')}
            </p>
          )}

          {state.kind === 'ready' && (
            <ul className="brand-editors" data-brand-editors-list>
              {staff.map((member) => {
                const granted = editors.some((editor) => editor.userId === member.id);

                return (
                  <li key={member.id} className="brand-editors__item">
                    <label className="brand-editors__label">
                      <input
                        type="checkbox"
                        checked={granted}
                        disabled={member.disabledAt !== null || busyId === member.id}
                        data-brand-editor={member.id}
                        onChange={() => {
                          void toggle(member, granted);
                        }}
                      />
                      <span>{member.displayName}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {editors.length === 0 && state.kind === 'ready' && (
            <p className="boss-sites-card__note">{t('boss.members.brandEditEmpty')}</p>
          )}
        </>
      )}

      {notice !== null && (
        <p className="boss-note" role="status" data-brand-editors-notice>
          {notice}
        </p>
      )}

      {error !== null && (
        <p className="boss-note boss-note--error" role="alert" data-brand-editors-error>
          {error}
        </p>
      )}
    </section>
  );
}
