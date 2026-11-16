import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchProject, type ProjectBriefVersion, type ProjectDetail } from '../api';
import { navigatePath } from '../router';
import { failureMessage } from './apiFailure';
import { formatProjectTime, projectStateLabel } from './projectState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; project: ProjectDetail }
  | { kind: 'notFound' }
  | { kind: 'denied' }
  | { kind: 'failed'; message: string };

export function ProjectDetailScreen({ projectId }: { projectId: string | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    let active = true;
    setCopyState('idle');
    setSelectedBriefId(null);

    if (projectId === null) {
      setState({ kind: 'notFound' });
      return () => {
        active = false;
      };
    }

    setState({ kind: 'loading' });
    void fetchProject(projectId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setState({ kind: 'ready', project: result.data.project });
        setSelectedBriefId(result.data.project.brief?.id ?? null);
        return;
      }
      if (result.failure.kind === 'http' && result.failure.status === 404) {
        setState({ kind: 'notFound' });
      } else if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
        setState({ kind: 'denied' });
      } else {
        setState({
          kind: 'failed',
          message: failureMessage(result.failure, t('design.project.detailFailed')),
        });
      }
    });

    return () => {
      active = false;
    };
  }, [projectId, reloadKey]);

  async function copyRequest(body: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(body);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  if (state.kind === 'loading') {
    return <p className="design-empty" role="status">{t('design.project.loading')}</p>;
  }

  if (state.kind === 'notFound') {
    return <p className="design-empty" role="alert">{t('design.project.notFound')}</p>;
  }

  if (state.kind === 'denied') {
    return <p className="design-note design-note--error" role="alert">{t('design.project.permissionDenied')}</p>;
  }

  if (state.kind === 'failed') {
    return (
      <div className="design-empty" role="alert">
        <p>{state.message}</p>
        <button type="button" className="design-btn" onClick={() => setReloadKey((key) => key + 1)}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const { project } = state;
  const shownBrief = project.briefVersions.find((version) => version.id === selectedBriefId) ?? project.brief;

  return (
    <article className="project-detail" data-design-page="project-detail">
      <div className="project-detail__topline">
        <button
          type="button"
          className="design-link"
          onClick={() => navigatePath('/design', 'create', 'projects')}
        >
          {t('design.project.back')}
        </button>
        <span className={`project-state project-state--${project.state}`}>
          {projectStateLabel(project.state)}
        </span>
      </div>

      <div className="project-detail__identity">
        <h2>{project.title}</h2>
        <p>{project.brandName}</p>
      </div>

      <div className="project-tabs" role="tablist" aria-label={project.title}>
        <button type="button" role="tab" aria-selected="true" className="project-tab project-tab--active">
          {t('design.project.briefTab')}
        </button>
      </div>

      <div className="project-brief-layout">
        <div className="project-brief-main">
          <section className="project-panel project-original">
            <div className="project-panel__heading">
              <div>
                <h2>{t('design.project.originalRequest')}</h2>
                <p>{t('design.project.originalRequestNote')}</p>
              </div>
              <button type="button" className="design-btn" onClick={() => void copyRequest(project.originalRequest.body)}>
                {t('design.project.copyRequest')}
              </button>
            </div>
            <p className="project-original__body">{project.originalRequest.body}</p>
            <p className="project-meta">{t('design.project.createdAt')}：{formatProjectTime(project.originalRequest.createdAt)}</p>
            {copyState !== 'idle' && (
              <p className={copyState === 'failed' ? 'design-note design-note--error' : 'design-note'} role="status">
                {t(copyState === 'failed' ? 'design.project.copyFailed' : 'design.project.copied')}
              </p>
            )}
          </section>

          <section className={`project-agent-state ${project.agentRun === null ? 'project-agent-state--waiting' : ''}`}>
            <h2>{project.agentRun === null ? t('design.project.agentWaiting') : t('design.project.agentClaimed')}</h2>
            {project.agentRun === null ? (
              <p>{t('design.project.agentWaitingBody')}</p>
            ) : (
              <p>{project.agentRun.agentName}・{formatProjectTime(project.agentRun.claimedAt)}</p>
            )}
          </section>

          <section className="project-panel project-brief">
            <div className="project-panel__heading">
              <div>
                <h2>{shownBrief === null ? t('design.project.briefEmpty') : t('design.project.currentBrief')}</h2>
                {shownBrief !== null && (
                  <p>{shownBrief.agentName}・{formatProjectTime(shownBrief.createdAt)}</p>
                )}
              </div>
              {shownBrief !== null && shownBrief.id === project.brief?.id && (
                <span className="project-current">{t('design.project.current')}</span>
              )}
            </div>

            {shownBrief === null ? (
              <p className="project-brief__empty">{t('design.project.briefEmptyBody')}</p>
            ) : (
              <BriefDocumentView version={shownBrief} />
            )}
          </section>
        </div>

        <aside className="project-history" aria-label={t('design.project.briefVersions')}>
          <h2>{t('design.project.briefVersions')}</h2>
          {project.briefVersions.length === 0 ? (
            <p>{t('design.project.noBriefShort')}</p>
          ) : (
            <ol className="project-history__list">
              {project.briefVersions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    className={version.id === shownBrief?.id ? 'project-history__version project-history__version--active' : 'project-history__version'}
                    onClick={() => setSelectedBriefId(version.id)}
                  >
                    <span>{t('design.project.version')} {version.versionNo}</span>
                    <small>{formatProjectTime(version.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </article>
  );
}

function BriefDocumentView({ version }: { version: ProjectBriefVersion }) {
  const fields = [
    ['design.project.objective', version.document.objective],
    ['design.project.audience', version.document.audience],
    ['design.project.channel', version.document.channel],
    ['design.project.format', version.document.format],
    ['design.project.language', version.document.language],
    ['design.project.dueDate', version.document.dueDate ?? t('design.project.noDueDate')],
  ] as const;

  return (
    <div className="brief-document">
      <dl className="brief-document__grid">
        {fields.map(([labelKey, value]) => (
          <div key={labelKey}>
            <dt>{t(labelKey)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="brief-document__constraints">
        <h3>{t('design.project.constraints')}</h3>
        {version.document.constraints.length === 0 ? (
          <p>{t('design.project.noConstraints')}</p>
        ) : (
          <ul>{version.document.constraints.map((item) => <li key={item}>{item}</li>)}</ul>
        )}
      </div>
      <details className="project-provenance">
        <summary>{t('design.project.source')}</summary>
        <dl>
          <div><dt>{t('design.project.sourceAgent')}</dt><dd>{version.agentName}</dd></div>
          <div><dt>{t('design.project.requestId')}</dt><dd>{version.requestId}</dd></div>
          <div><dt>{t('design.project.submittedAt')}</dt><dd>{formatProjectTime(version.createdAt)}</dd></div>
        </dl>
      </details>
    </div>
  );
}
