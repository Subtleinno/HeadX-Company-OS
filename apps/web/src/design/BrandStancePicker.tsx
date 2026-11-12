import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { createGapNeed } from '../api';
import { failureMessage } from './apiFailure';
import { candidatesOf, missingTests, TESTS, type PlatformDoc } from './brandPlatform';

/**
 * 立場句選擇（issue #61，畫面規格 `05-stance-picker.md`）。
 *
 * 720px 對話框：三個候選（每個附理由）＋「或自己寫一句」＋定位三檢三張小卡。
 *
 * 三件事刻意這樣做：
 *   1. **候選由 agent 出，不由前端砌。** 沒有候選就講沒有 —— 自己拼三句看起來
 *      很像的話，等於替老闆決定了立場。
 *   2. **缺證據仍然可以確定。** 三檢缺一項不是錯誤，是一個缺口：確定之後平台頁
 *      會標出來，並可以在這裡直接建立 Need（判斷型，只有老闆補）。
 *   3. **「叫 agent 再出候選」不是一個假按鈕。** 它真的建立一張 Need，把工作
 *      交回 agent，並把編號講出來。
 */

export type StancePickerProps = {
  brandId: string;
  doc: PlatformDoc;
  pageKey: string;
  isOwner: boolean;
  canEdit: boolean;
  onConfirm: (stance: string) => void;
  onClose: () => void;
};

export function StancePicker(props: StancePickerProps) {
  const candidates = candidatesOf(props.doc);
  const [picked, setPicked] = useState<string>(props.doc.stance !== '' ? props.doc.stance : (candidates[0]?.text ?? ''));
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 換了一批候選（例如重編之後）就跟著改預選，不留在一個已經不存在的句子。
  useEffect(() => {
    setPicked(props.doc.stance !== '' ? props.doc.stance : (candidates[0]?.text ?? ''));
  }, [props.doc.stance, props.doc.stance_candidates.length]);

  const finalStance = own.trim() !== '' ? own.trim() : picked;

  async function createNeed(item: string): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await createGapNeed(props.brandId, { pageKey: props.pageKey, item });

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.gap.failed')));
      return;
    }

    setNotice(t('brand.platform.needCreated', { code: result.data.need.code }));
  }

  return (
    <div className="stance-backdrop" data-stance-picker>
      <div className="stance" role="dialog" aria-modal="true" aria-labelledby="stance-title">
        <header className="stance__head">
          <h2 className="stance__title" id="stance-title">
            {t('brand.platform.pickTitle')}
          </h2>
          <p className="stance__lead">{t('brand.platform.pickLead')}</p>
        </header>

        {candidates.length === 0 ? (
          <p className="stance__empty">{t('brand.platform.noCandidate')}</p>
        ) : (
          <ul className="stance__list">
            {candidates.map((candidate, index) => (
              <li key={candidate.text}>
                <label
                  className="stance__card"
                  data-stance-candidate={index + 1}
                  data-picked={picked === candidate.text && own.trim() === '' ? 'true' : 'false'}
                >
                  <input
                    type="radio"
                    name="stance"
                    className="stance__radio"
                    checked={picked === candidate.text && own.trim() === ''}
                    onChange={() => {
                      setPicked(candidate.text);
                      setOwn('');
                    }}
                  />
                  <span className="stance__text">{candidate.text}</span>
                  <span className="stance__reason">{candidate.reason}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <label className="stance__own">
          <span className="design-field__label">{t('brand.platform.own')}</span>
          <input
            className="design-input"
            value={own}
            data-stance-own
            onChange={(event) => {
              setOwn(event.target.value);
            }}
          />
        </label>

        <section className="stance__tests" data-stance-tests>
          {TESTS.map((test) => {
            const evidence = props.doc.tests[test.key];
            const ok = evidence.trim() !== '';

            return (
              <div
                className="stance__test"
                key={test.key}
                data-stance-test={test.key}
                data-state={ok ? 'ok' : 'missing'}
              >
                <p className="stance__testHead">
                  <span className={ok ? 'stance__ok' : 'stance__missing'}>{t(test.labelKey)}</span>
                  <span className={ok ? 'stance__ok' : 'stance__missing'}>
                    {ok ? t('brand.platform.evidenceOk') : t('brand.platform.evidenceMissing')}
                  </span>
                </p>
                <p className="stance__testBody">
                  {ok ? evidence : t('brand.platform.ownerOnly')}
                </p>

                {!ok && props.isOwner && props.canEdit && (
                  <button
                    type="button"
                    className="stance__need"
                    data-stance-need={test.key}
                    disabled={busy}
                    onClick={() => {
                      void createNeed(`tests.${test.key}`);
                    }}
                  >
                    {t('brand.gap.create')}
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {notice !== null && (
          <p className="design-note" role="status" data-stance-notice>
            {notice}
          </p>
        )}

        {error !== null && (
          <p className="design-note design-note--error" role="alert" data-stance-error>
            {error}
          </p>
        )}

        <div className="stance__actions">
          {/* 候選由 agent 出：要新一批就真的交一張工單，不是重畫同一批。
              有三個候選時不出這個鍵 —— 缺口唔存在，按下去只會得到一個 404。 */}
          {candidates.length < 3 && (
            <button
              type="button"
              className="design-btn"
              data-stance-regenerate
              disabled={busy || !props.canEdit}
              onClick={() => {
                void createNeed('stance_candidates');
              }}
            >
              {t('brand.platform.regenerate')}
            </button>
          )}

          <button
            type="button"
            className="design-btn design-btn--primary"
            data-stance-confirm
            disabled={finalStance === ''}
            onClick={() => {
              props.onConfirm(finalStance);
            }}
          >
            {t('brand.platform.confirm')}
          </button>
        </div>

        <button type="button" className="stance__close" onClick={props.onClose}>
          {t('brand.gap.close')}
        </button>
      </div>
    </div>
  );
}

/** 三檢缺幾項（給編輯器顯示，不重複算一次）。 */
export function missingTestCount(doc: PlatformDoc): number {
  return missingTests(doc).length;
}
