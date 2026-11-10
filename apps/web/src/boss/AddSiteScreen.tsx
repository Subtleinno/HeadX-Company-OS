import { useState } from 'react';
import { t } from '@company-os/i18n';
import { createSite } from '../api';
import { formatDate } from './useSites';

/**
 * 新增據點（設計稿 frame-07）。
 *
 * 三步：填資料 → 取一次性憑證 → 對方確認。
 *
 * 最重要嘅一句在第二步：**憑證明文只出現一次**。資料庫只存 hash，
 * 所以「再顯示一次」係做唔到的。畫面要老實講，否則用戶會以為可以返轉頭攞，
 * 到時要重做一次整個流程。
 */

type AddSiteScreenProps = {
  onDone: () => void;
};

const CODE_PATTERN = /^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}-[A-Z0-9]{1,4}$/;

/**
 * 三步指示器（設計稿 frame-07 三個 pill）。
 *
 * 第三步「匯入確認檔並批准」而家做唔到 —— 收確認檔嘅端點未存在。所以照列
 * 但灰掉：收起一格等於同用戶講「得兩步」，而佢最後會發現少咗一步。
 * 未做到嘅步驟要顯示為未做到，唔係消失。
 */
function Steps({ active }: { active: 1 | 2 | 3 }) {
  const steps: { n: 1 | 2 | 3; key: 'boss.add.stepFill' | 'boss.add.stepToken' | 'boss.add.stepConfirm' }[] = [
    { n: 1, key: 'boss.add.stepFill' },
    { n: 2, key: 'boss.add.stepToken' },
    { n: 3, key: 'boss.add.stepConfirm' },
  ];

  return (
    <ol className="boss-steps" data-add-site-steps>
      {steps.map((step) => (
        <li
          key={step.n}
          className="boss-steps__item"
          data-step={step.n}
          data-step-state={step.n === active ? 'current' : step.n < active ? 'done' : 'todo'}
        >
          <span className="boss-steps__num">{step.n}</span>
          {t(step.key)}
        </li>
      ))}
    </ol>
  );
}

export function AddSiteScreen({ onDone }: AddSiteScreenProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [companyLabel, setCompanyLabel] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (busy) {
      return;
    }

    const normalized = code.trim().toUpperCase();

    if (!CODE_PATTERN.test(normalized)) {
      setError(t('boss.add.invalid'));
      return;
    }

    setError(null);
    setBusy(true);

    const result = await createSite({
      code: normalized,
      name: name.trim(),
      companyLabel: companyLabel.trim(),
      city: city.trim(),
    });

    setBusy(false);

    if (result.ok) {
      setInvite(result.data.invite);
      return;
    }

    if (result.failure.kind === 'http') {
      setError(
        result.failure.error === 'duplicate_code' ? t('boss.add.duplicate') : t('boss.add.invalid'),
      );
      return;
    }

    setError(t('boss.add.failed'));
  }

  async function handleCopy(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // 剪貼簿要權限；拒絕唔算錯誤，用戶自己選取都可以。所以只講清楚。
      setError(t('boss.add.copyFailed'));
    }
  }

  if (invite !== null) {
    const expires = formatDate(invite.expiresAt);

    return (
      <div className="boss-invite">
        <Steps active={2} />
        <h2 className="boss-invite__title">{t('boss.add.tokenTitle')}</h2>
        <code className="boss-invite__token" data-invite-token>
          {invite.token}
        </code>
        <div className="boss-invite__actions">
          <button
            type="button"
            className="boss-btn"
            onClick={() => void handleCopy(invite.token)}
          >
            {copied ? t('boss.add.copied') : t('boss.add.copy')}
          </button>
          <button type="button" className="boss-btn boss-btn--primary" onClick={onDone}>
            {t('boss.add.done')}
          </button>
        </div>
        <p className="boss-invite__note">{t('boss.add.tokenNote')}</p>
        {expires !== null && (
          <p className="boss-invite__note">{t('boss.add.expires', { date: expires })}</p>
        )}
        {error !== null && (
          <p className="boss-note boss-note--error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="boss-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <Steps active={1} />

      <label className="boss-field">
        <span className="boss-field__label">{t('boss.add.code')}</span>
        <input
          className="boss-input"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          placeholder="HK-HQ-01"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <span className="boss-field__hint">{t('boss.add.codeHint')}</span>
      </label>

      <label className="boss-field">
        <span className="boss-field__label">{t('boss.add.name')}</span>
        <input
          className="boss-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          autoComplete="off"
          required
        />
      </label>

      <label className="boss-field">
        <span className="boss-field__label">{t('boss.add.company')}</span>
        <input
          className="boss-input"
          value={companyLabel}
          onChange={(event) => {
            setCompanyLabel(event.target.value);
          }}
          autoComplete="off"
        />
        <span className="boss-field__hint">{t('boss.add.companyHint')}</span>
      </label>

      <label className="boss-field">
        <span className="boss-field__label">{t('boss.add.city')}</span>
        <input
          className="boss-input"
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
          }}
          autoComplete="off"
        />
      </label>

      {error !== null && (
        <p className="boss-note boss-note--error" role="alert">
          {error}
        </p>
      )}

      <div className="boss-form__actions">
        <button type="button" className="boss-btn" onClick={onDone}>
          {t('boss.add.cancel')}
        </button>
        <button type="submit" className="boss-btn boss-btn--primary" disabled={busy}>
          {busy ? t('boss.add.saving') : t('boss.add.submit')}
        </button>
      </div>
    </form>
  );
}
