import { useEffect, useRef, useState, type RefObject } from 'react';

export type FieldProps = {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** 由畫面持有，用來把焦點移到第一個出錯的欄位。 */
  inputRef?: RefObject<HTMLInputElement | null>;
};

/**
 * 表單欄位：一定有可見的 label，不是靠 placeholder。
 * 密碼欄位另外給一個文字按鈕「顯示／隱藏」，不用圖示。
 */
export function Field({
  id,
  label,
  type = 'text',
  value,
  autoComplete,
  onChange,
  error,
  autoFocus = false,
  disabled = false,
  inputRef,
}: FieldProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const errorId = `${id}-error`;

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus, ref]);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__row">
        <input
          ref={ref}
          id={id}
          className="input"
          type={isPassword && revealed ? 'text' : type}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="button button--text"
            aria-pressed={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? '隱藏' : '顯示'}
          </button>
        )}
      </div>
      {error !== undefined && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
