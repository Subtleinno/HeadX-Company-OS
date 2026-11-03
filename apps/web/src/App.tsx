import { useEffect, useState } from 'react';

type ErrorReason = 'api' | 'db';

type ApiState =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; reason: ErrorReason; detail: string };

class HealthError extends Error {
  readonly reason: ErrorReason;

  constructor(message: string, reason: ErrorReason) {
    super(message);
    this.reason = reason;
  }
}

function isHealthy(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const body = value as { status?: unknown; checks?: unknown };
  if (body.status !== 'ok' || typeof body.checks !== 'object' || body.checks === null) {
    return false;
  }

  return (body.checks as { db?: unknown }).db === 'ok';
}

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (response.status === 503) {
          throw new HealthError('HTTP 503', 'db');
        }

        if (!response.ok) {
          throw new HealthError(`HTTP ${response.status}`, 'api');
        }

        const body: unknown = await response.json();
        if (!isHealthy(body)) {
          throw new HealthError('回應格式不正確', 'api');
        }

        if (!cancelled) {
          setApiState({ kind: 'ok' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setApiState({
            kind: 'error',
            reason: error instanceof HealthError ? error.reason : 'api',
            detail: error instanceof Error ? error.message : '未知錯誤',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <h1 className="title">company-os</h1>
        <div className="rule" aria-hidden="true" />
        <p className={`status status--${apiState.kind}`} role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {apiState.kind === 'loading' && '正在檢查 API'}
          {apiState.kind === 'ok' && 'API 正常'}
          {apiState.kind === 'error' &&
            (apiState.reason === 'db' ? 'API 未就緒（資料庫）' : 'API 無法連線')}
        </p>
        {apiState.kind === 'error' && <p className="detail">{apiState.detail}</p>}
      </section>
    </main>
  );
}
