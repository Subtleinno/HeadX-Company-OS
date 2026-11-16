import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchProjects, type ProjectFormat, type ProjectList } from '../api';
import { navigatePath } from '../router';
import { ProjectCreateForm } from './ProjectCreateForm';
import { formatProjectTime, projectStateLabel } from './projectState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ProjectList }
  | { kind: 'failed'; message: string }
  | { kind: 'denied' };

export type ProjectCounts = Record<'projects' | ProjectFormat, number>;

export function ProjectsScreen({
  brandId,
  brandsKind,
  onReloadBrands,
  format = 'all',
  query = '',
  onCountsChange,
}: {
  brandId: string | null;
  brandsKind: 'loading' | 'ready' | 'failed';
  onReloadBrands: () => void;
  format?: ProjectFormat | 'all';
  query?: string;
  onCountsChange?: (counts: ProjectCounts) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (brandId === null) {
      setState({ kind: 'ready', data: { projects: [], total: 0 } });
      return;
    }

    setState({ kind: 'loading' });
    const result = await fetchProjects(brandId);
    if (result.ok) {
      setState({ kind: 'ready', data: result.data });
      return;
    }
    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setState({ kind: 'denied' });
      return;
    }
    setState({
      kind: 'failed',
      message: result.failure.kind === 'network' ? t('error.network') : t('design.project.loadFailed'),
    });
  }, [brandId]);

  useEffect(() => {
    let active = true;
    setCreateOpen(false);
    void (async () => {
      if (brandId === null) {
        if (active) setState({ kind: 'ready', data: { projects: [], total: 0 } });
        return;
      }
      setState({ kind: 'loading' });
      const result = await fetchProjects(brandId);
      if (!active) return;
      if (result.ok) {
        setState({ kind: 'ready', data: result.data });
      } else if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
        setState({ kind: 'denied' });
      } else {
        setState({
          kind: 'failed',
          message: result.failure.kind === 'network' ? t('error.network') : t('design.project.loadFailed'),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [brandId]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const projects = state.data.projects;
    onCountsChange?.({
      projects: projects.length,
      carousel: projects.filter((project) => project.format === 'carousel').length,
      presentation: projects.filter((project) => project.format === 'presentation').length,
      video: projects.filter((project) => project.format === 'video').length,
    });
  }, [state, onCountsChange]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProjects = state.kind === 'ready'
    ? state.data.projects.filter((project) => {
        if (format !== 'all' && project.format !== format) return false;
        if (normalizedQuery === '') return true;
        return `${project.title} ${project.brandName} ${project.format}`.toLocaleLowerCase().includes(normalizedQuery);
      })
    : [];

  if (brandsKind === 'loading') {
    return <div className="projects-screen" data-design-page="projects"><p className="design-empty" role="status">{t('design.project.loading')}</p></div>;
  }

  if (brandsKind === 'failed') {
    return (
      <div className="projects-screen" data-design-page="projects">
        <div className="design-empty" role="alert">
          <p>{t('design.project.loadFailed')}</p>
          <button type="button" className="design-btn" onClick={onReloadBrands}>{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="projects-screen" data-design-page="projects">
      <div className="projects-toolbar">
        <p className="projects-lead">{t('design.project.listLead')}</p>
        {state.kind === 'ready' && brandId !== null && (
          <button
            type="button"
            className="design-btn design-btn--primary"
            onClick={() => setCreateOpen((open) => !open)}
          >
            {t('design.project.create')}
          </button>
        )}
      </div>

      {createOpen && brandId !== null && (
        <ProjectCreateForm
          key={format}
          brandId={brandId}
          initialFormat={format === 'all' ? 'carousel' : format}
          onCancel={() => setCreateOpen(false)}
          onCreated={(project) => {
            navigatePath('/design', 'create', 'projects', project.id, 'brief');
          }}
        />
      )}

      {brandId === null ? (
        <div className="design-empty">
          <p className="design-empty__title">{t('design.project.noBrand')}</p>
        </div>
      ) : state.kind === 'loading' ? (
        <p className="design-empty" role="status">{t('design.project.loading')}</p>
      ) : state.kind === 'denied' ? (
        <p className="design-note design-note--error" role="alert">
          {t('design.project.listDenied')}
        </p>
      ) : state.kind === 'failed' ? (
        <div className="design-empty" role="alert">
          <p>{state.message}</p>
          <button type="button" className="design-btn" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </div>
      ) : state.data.projects.length === 0 ? (
        <div className="design-empty">
          <p className="design-empty__title">{t('design.project.empty')}</p>
          <p className="design-empty__body">{t('design.project.emptyBody')}</p>
          {!createOpen && (
            <button type="button" className="design-btn design-btn--primary" onClick={() => setCreateOpen(true)}>
              {t('design.project.create')}
            </button>
          )}
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="design-empty">
          <p className="design-empty__title">{t('design.project.emptyFilter')}</p>
          <p className="design-empty__body">{t('design.project.emptyFilterBody')}</p>
          {!createOpen && normalizedQuery === '' && (
            <button type="button" className="design-btn design-btn--primary" onClick={() => setCreateOpen(true)}>
              {t('design.project.create')}
            </button>
          )}
        </div>
      ) : (
        <section className="project-library" aria-label={t('design.page.projects')}>
          <div className="project-library__summary">
            <span>{visibleProjects.length} {t('design.project.count')}</span>
            {normalizedQuery !== '' && <span>{t('design.project.searchResults', { query: query.trim() })}</span>}
          </div>
          <div className="project-preview-grid">
            {visibleProjects.map((project) => (
              <button
                type="button"
                className="project-preview-card"
                key={project.id}
                aria-label={project.title}
                onClick={() => navigatePath('/design', 'create', 'projects', project.id, 'brief')}
              >
                <span className={`project-preview-card__media project-preview-card__media--${project.format}`}>
                  {project.previewUrl === null ? (
                    <span className="project-preview-card__fallback">
                      <small>{t(`design.project.format.${project.format}`)}</small>
                      <strong>{project.title}</strong>
                      <span>{project.brandName}</span>
                    </span>
                  ) : (
                    <img src={project.previewUrl} alt="" loading="lazy" />
                  )}
                </span>
                <span className="project-preview-card__info">
                  <span className="project-preview-card__title"><strong>{project.title}</strong><span className={`project-state project-state--${project.state}`}>{projectStateLabel(project.state)}</span></span>
                  <span className="project-preview-card__meta">
                    <time dateTime={project.createdAt}>{formatProjectTime(project.createdAt)}</time>
                    <span>{project.briefVersionNo === null ? t('design.project.noBriefShort') : `${t('design.project.version')} ${project.briefVersionNo}`}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
