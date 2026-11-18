import { useState } from 'react';
import { t } from '@company-os/i18n';
import { createBrand } from '../api';

/**
 * 新增品牌（2026-11-17 老闆：入口屬於公司層，不放在 Design）。
 *
 * 為什麼在 Boss：品牌一開，全公司（Design 的五個模組、品牌 selector、Boss 的
 * 業務總覽）即刻都有內容 —— 這是一個公司層的動作，不是某個部門的偏好設定。
 *
 * 代碼只用小寫英文字母、數字、連字號：它會用於網址與檔案路徑，大寫或空格
 * 遲早要在某處轉換，兩邊轉法不同就會出現「同一個品牌、兩條路徑」。
 */

type BrandCreateFormProps = {
  onCreated: () => void;
  onCancel: () => void;
};

export function BrandCreateForm({ onCreated, onCancel }: BrandCreateFormProps) {
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
      setError(t('boss.brand.invalid'));
      return;
    }

    setError(null);
    setBusy(true);

    const result = await createBrand({ code: trimmedCode, name: trimmedName });

    setBusy(false);

    if (result.ok) {
      setCode('');
      setName('');
      onCreated();
      return;
    }

    if (result.failure.kind === 'http') {
      setError(
        result.failure.error === 'duplicate_code' ? t('boss.brand.duplicate') : t('boss.brand.invalid'),
      );
      return;
    }

    setError(t('boss.brand.createFailed'));
  }

  return (
    <form
      className="boss-form boss-brandform"
      data-brand-create-form
      onSubmit={(event) => {
        event.preventDefault();
        void handleCreate();
      }}
    >
      <h2 className="boss-brandform__title">{t('boss.brand.formTitle')}</h2>

      <label className="boss-field">
        <span className="boss-field__label">{t('boss.brand.code')}</span>
        <input
          className="boss-input"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          placeholder="moonic"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="boss-field__hint">{t('boss.brand.codeHint')}</span>
      </label>

      <label className="boss-field">
        <span className="boss-field__label">{t('boss.brand.name')}</span>
        <input
          className="boss-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          autoComplete="off"
        />
      </label>

      {error !== null && (
        <p className="boss-note boss-note--error" role="alert" data-brand-create-error>
          {error}
        </p>
      )}

      <div className="boss-form__actions">
        <button type="button" className="boss-btn" onClick={onCancel} disabled={busy}>
          {t('boss.brand.cancel')}
        </button>
        <button type="submit" className="boss-btn boss-btn--primary" disabled={busy} data-brand-create-submit>
          {busy ? t('boss.brand.saving') : t('boss.brand.create')}
        </button>
      </div>
    </form>
  );
}
