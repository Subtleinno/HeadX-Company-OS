import { useRef, useState } from 'react';
import { t } from '@company-os/i18n';
import { createProject, type ProjectDetail } from '../api';
import { failureMessage } from './apiFailure';

type Props = {
  brandId: string;
  onCreated: (project: ProjectDetail) => void;
  onCancel: () => void;
};

export function ProjectCreateForm({ brandId, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);

  async function submit(): Promise<void> {
    if (busy) return;
    const cleanTitle = title.trim();
    const cleanRequest = request.trim();
    if (cleanTitle === '' || cleanRequest === '') {
      setError(t('design.project.missingInput'));
      return;
    }

    // 網絡重試沿用同一 key；用戶一改內容就由下一個新請求取得新 key。
    requestKey.current ??= globalThis.crypto.randomUUID();
    setBusy(true);
    setError(null);
    const result = await createProject(
      { brandId, title: cleanTitle, request: cleanRequest },
      requestKey.current,
    );
    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('design.project.createFailed')));
      return;
    }

    requestKey.current = null;
    onCreated(result.data.project);
  }

  return (
    <section className="project-create" aria-labelledby="project-create-title">
      <h2 id="project-create-title" className="project-section__title">
        {t('design.project.createTitle')}
      </h2>
      <p className="project-section__lead">{t('design.project.createLead')}</p>
      <form
        className="design-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="design-field">
          <label className="design-field__label" htmlFor="project-title">
            {t('design.project.title')}
          </label>
          <input
            id="project-title"
            className="design-input"
            value={title}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => {
              requestKey.current = null;
              setTitle(event.target.value);
            }}
          />
          <span className="design-field__hint">{t('design.project.titleHint')}</span>
        </div>

        <div className="design-field">
          <label className="design-field__label" htmlFor="project-request">
            {t('design.project.request')}
          </label>
          <textarea
            id="project-request"
            className="design-input project-create__request"
            value={request}
            rows={6}
            maxLength={20000}
            onChange={(event) => {
              requestKey.current = null;
              setRequest(event.target.value);
            }}
          />
          <span className="design-field__hint">{t('design.project.requestHint')}</span>
        </div>

        {error !== null && (
          <p className="design-note design-note--error" role="alert">
            {error}
          </p>
        )}

        <div className="design-form__actions">
          <button type="submit" className="design-btn design-btn--primary" disabled={busy}>
            {busy ? t('design.project.creating') : t('design.project.createAction')}
          </button>
          <button type="button" className="design-btn" disabled={busy} onClick={onCancel}>
            {t('design.project.cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
