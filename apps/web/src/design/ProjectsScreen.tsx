import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchProjects, type ProjectList } from '../api';
import { navigatePath } from '../router';
import { ProjectCreateForm } from './ProjectCreateForm';
import { formatProjectTime, projectStateLabel } from './projectState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ProjectList }
  | { kind: 'failed'; message: string }
  | { kind: 'denied' };

export function ProjectsScreen({
  brandId,
  brandsKind,
  onReloadBrands,
}: {
  brandId: string | null;
  brandsKind: 'loading' | 'ready' | 'failed';
  onReloadBrands: () => void;
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
          brandId={brandId}
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
      ) : (
        <section className="project-list" aria-label={t('design.page.projects')}>
          <p className="project-list__count">{state.data.total} {t('design.project.count')}</p>
          <div className="project-table-wrap">
            <table className="project-table">
              <thead>
                <tr>
                  <th>{t('design.project.columnTitle')}</th>
                  <th>{t('design.project.columnState')}</th>
                  <th>{t('design.project.columnBrief')}</th>
                  <th>{t('design.project.columnCreated')}</th>
                </tr>
              </thead>
              <tbody>
                {state.data.projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <button
                        type="button"
                        className="project-table__link"
                        onClick={() => navigatePath('/design', 'create', 'projects', project.id, 'brief')}
                      >
                        {project.title}
                      </button>
                      <span className="project-table__brand">{project.brandName}</span>
                    </td>
                    <td><span className={`project-state project-state--${project.state}`}>{projectStateLabel(project.state)}</span></td>
                    <td>{project.briefVersionNo === null ? t('design.project.noBriefShort') : `${t('design.project.version')} ${project.briefVersionNo}`}</td>
                    <td className="project-table__time">{formatProjectTime(project.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
