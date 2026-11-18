import { Icon } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  createProject,
  createProjectFolder,
  createProjectSet,
  deleteProject,
  deleteProjectFolder,
  deleteProjectSet,
  duplicateProject,
  duplicateProjectSet,
  fetchProjectLibrary,
  fetchProjects,
  fileDownloadUrl,
  renameProjectFolder,
  restoreProjectSet,
  updateProject,
  updateProjectSet,
  type ProjectLibrary,
  type ProjectSet,
  type ProjectSummary,
} from '../api';

/**
 * Create 模組：Project Library（作品庫）。
 *
 * 老闆 2026-11-18 定：
 *   左欄是一棵「資料夾（folder）→ 專案集（set）」的樹；點一個專案集，
 *   右邊主區顯示它裡面的專案（project）卡片。
 *   頂部「ALL / PPT / 排版 / Video」是格式**過濾器**，跨所有資料夾篩選。
 *   三層都有 CRUD；專案可以複製、可以自由搬到另一個專案集。
 *
 * 規則（唯一入口）：
 *   1. 資料夾只是分類；刪資料夾不會刪專案集（回到未分類）。
 *   2. 刪專案集是軟刪，可還原。
 *   3. 複製專案＝現況抄一份，不抄歷史。
 */

type Menu = { kind: 'folder' | 'set'; id: string } | null;
type Rename = { kind: 'folder' | 'set'; id: string; value: string } | null;

export function CreateLibrary(props: { brandId: string; onReloadBrands?: () => void; railOpen?: boolean; onToggleRail?: () => void }) {
  const { brandId, railOpen = true } = props;

  const [library, setLibrary] = useState<ProjectLibrary | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const [activeSetId, setActiveSetId] = useState<string | 'none' | null>(null);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [projectsQuery, setProjectsQuery] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsState, setProjectsState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const [menu, setMenu] = useState<Menu>(null);
  const [renaming, setRenaming] = useState<Rename>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<'folder' | 'set' | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [newFolder, setNewFolder] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [newSetFolder, setNewSetFolder] = useState<string>('');

  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectFormat, setNewProjectFormat] = useState<string>('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLoadState('loading');
    const result = await fetchProjectLibrary(brandId);

    if (result.ok) {
      setLibrary(result.data);
      setLoadState('ready');
    } else {
      setLoadState('failed');
    }
  }, [brandId]);

  const loadProjects = useCallback(async () => {
    setProjectsState('loading');
    const filter: { setId?: string | 'none'; formatId?: string; q?: string } = {};

    if (activeSetId !== null) filter.setId = activeSetId;
    if (formatId !== null) filter.formatId = formatId;
    if (projectsQuery.trim() !== '') filter.q = projectsQuery;

    const result = await fetchProjects(brandId, filter);

    if (result.ok) {
      setProjects(result.data.projects);
      setProjectsState('ready');
    } else {
      setProjectsState('failed');
    }
  }, [brandId, activeSetId, formatId, projectsQuery]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setMenu(null);
    setMovingId(null);
  }, [activeSetId]);

  useEffect(() => {
    if (menu === null && movingId === null) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenu(null);
        setMovingId(null);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, movingId]);

  async function run(task: () => Promise<{ ok: boolean; error?: string }>): Promise<void> {
    setBusy(true);
    setError('');
    const result = await task();
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? t('design.create.failed'));
      return;
    }

    await Promise.all([loadLibrary(), loadProjects()]);
  }

  const folders = library?.folders ?? [];
  const sets = library?.sets ?? [];
  const formats = library?.formats ?? [];
  const deletedSets = library?.deletedSets ?? [];

  const needle = query.trim().toLowerCase();
  const match = (name: string): boolean => needle === '' || name.toLowerCase().includes(needle);
  const visibleSets = sets.filter((item) => match(item.name));
  const unfiled = visibleSets.filter((item) => item.folderId === null);
  const unfiledTotal = sets.filter((item) => item.folderId === null).length;

  async function submitFolder(): Promise<void> {
    const name = newFolder.trim();
    if (name === '') return;

    await run(async () => {
      const result = await createProjectFolder(brandId, name);
      return result.ok ? { ok: true } : { ok: false };
    });
    setNewFolder('');
    setCreating(null);
  }

  async function submitSet(): Promise<void> {
    const name = newSetName.trim();
    if (name === '') return;

    await run(async () => {
      const result = await createProjectSet(brandId, {
        name,
        folderId: newSetFolder === '' ? null : newSetFolder,
      });
      if (!result.ok) return { ok: false };
      setNewSetName('');
      setCreating(null);
      setActiveSetId(result.data.id);
      return { ok: true };
    });
  }

  async function submitRename(): Promise<void> {
    if (renaming === null) return;
    const value = renaming.value.trim();
    if (value === '') return;

    const { kind, id } = renaming;
    setRenaming(null);

    await run(async () => {
      if (kind === 'folder') {
        const result = await renameProjectFolder(id, value);
        return result.ok ? { ok: true } : { ok: false };
      }
      const result = await updateProjectSet(id, { name: value });
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function moveSet(setId: string, folderId: string | null): Promise<void> {
    setMovingId(null);
    await run(async () => {
      const result = await updateProjectSet(setId, { folderId });
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function duplicateSet(set: ProjectSet): Promise<void> {
    setMenu(null);
    await run(async () => {
      const result = await duplicateProjectSet(set.id, { name: t('design.create.copyName', { name: set.name }) });
      if (!result.ok) return { ok: false };
      setActiveSetId(result.data.id);
      return { ok: true };
    });
  }

  async function removeSet(set: ProjectSet): Promise<void> {
    setMenu(null);
    if (!window.confirm(t('design.create.deleteSetConfirm', { name: set.name }))) return;
    await run(async () => {
      const result = await deleteProjectSet(set.id);
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function removeFolder(id: string, name: string): Promise<void> {
    setMenu(null);
    if (!window.confirm(t('design.create.deleteFolderConfirm', { name }))) return;
    await run(async () => {
      const result = await deleteProjectFolder(id);
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function restoreSet(setId: string): Promise<void> {
    await run(async () => {
      const result = await restoreProjectSet(setId);
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function submitProject(): Promise<void> {
    const title = newProjectTitle.trim();
    if (title === '' || newProjectFormat === '') return;

    await run(async () => {
      const result = await createProject(brandId, {
        title,
        formatId: newProjectFormat,
        setId: activeSetId === 'none' ? null : activeSetId,
      });
      if (!result.ok) return { ok: false };
      setNewProjectTitle('');
      setCreatingProject(false);
      return { ok: true };
    });
  }

  async function duplicateProjectCard(project: ProjectSummary): Promise<void> {
    await run(async () => {
      const result = await duplicateProject(project.id, {
        title: t('design.create.copyName', { name: project.title }),
      });
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function removeProject(project: ProjectSummary): Promise<void> {
    if (!window.confirm(t('design.create.deleteProjectConfirm', { name: project.title }))) return;
    await run(async () => {
      const result = await deleteProject(project.id);
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  async function moveProject(project: ProjectSummary, setId: string | null): Promise<void> {
    await run(async () => {
      const result = await updateProject(project.id, { setId });
      return result.ok ? { ok: true } : { ok: false };
    });
  }

  function renderSetRow(set: ProjectSet): ReactNode {
    const active = activeSetId === set.id;

    if (renaming !== null && renaming.kind === 'set' && renaming.id === set.id) {
      return (
        <form
          className="create-rail__inline"
          key={set.id}
          onSubmit={(event) => {
            event.preventDefault();
            void submitRename();
          }}
        >
          <input
            className="create-rail__input"
            data-create-rename-input
            value={renaming.value}
            autoFocus
            onChange={(event) => setRenaming({ kind: 'set', id: set.id, value: event.target.value })}
            onBlur={() => setRenaming(null)}
          />
        </form>
      );
    }

    if (movingId === set.id) {
      return (
        <div className="create-rail__move" data-create-move-menu key={set.id}>
          <span className="create-rail__moveLabel">{t('design.create.moveTo')}</span>
          <button type="button" className="create-rail__moveItem" onClick={() => void moveSet(set.id, null)}>
            {t('design.create.unfiled')}
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="create-rail__moveItem"
              onClick={() => void moveSet(set.id, folder.id)}
            >
              {folder.name}
            </button>
          ))}
          <button type="button" className="create-rail__moveCancel" onClick={() => setMovingId(null)}>
            {t('design.create.cancel')}
          </button>
        </div>
      );
    }

    return (
      <div
        key={set.id}
        className={`create-rail__row${active ? ' create-rail__row--active' : ''}`}
        data-create-set-row={set.id}
      >
        <button type="button" className="create-rail__rowMain" onClick={() => setActiveSetId(set.id)}>
          <span className="create-rail__rowName">{set.name}</span>
          {set.count > 0 && (
            <span className="create-rail__rowBadge" title={`${set.count}`}>
              {set.count}
            </span>
          )}
        </button>
        <button
          type="button"
          className="create-rail__rowMenuBtn"
          aria-label={t('design.create.manage', { name: set.name })}
          data-create-set-menu={set.id}
          onClick={() => setMenu(menu !== null && menu.id === set.id ? null : { kind: 'set', id: set.id })}
        >
          <span aria-hidden="true" className="create-rail__dots" />
        </button>

        {menu !== null && menu.kind === 'set' && menu.id === set.id && (
          <div className="create-rail__menu" data-create-set-menu-panel>
            <button type="button" onClick={() => { setMenu(null); setActiveSetId(set.id); }}>
              {t('design.create.open')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setRenaming({ kind: 'set', id: set.id, value: set.name });
              }}
            >
              {t('design.create.rename')}
            </button>
            <button type="button" onClick={() => { setMenu(null); setMovingId(set.id); }}>
              {t('design.create.moveTo')}
            </button>
            <button type="button" onClick={() => void duplicateSet(set)}>
              {t('design.create.duplicate')}
            </button>
            <button type="button" className="create-rail__danger" onClick={() => void removeSet(set)}>
              {t('design.create.delete')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="create-module" data-create-module data-create-rail-open={railOpen ? 'true' : 'false'}>
      {railOpen && (
        <aside className="create-rail" data-create-rail aria-label={t('design.create.library')}>
        <div className="create-rail__formats" data-create-formats>
          <button
            type="button"
            className={`create-rail__format${formatId === null ? ' create-rail__format--active' : ''}`}
            data-create-format="all"
            onClick={() => setFormatId(null)}
          >
            {t('design.create.all')}
          </button>
          {formats.map((format) => (
            <button
              key={format.id}
              type="button"
              className={`create-rail__format${formatId === format.id ? ' create-rail__format--active' : ''}`}
              data-create-format={format.id}
              onClick={() => setFormatId(format.id)}
            >
              {format.name}
            </button>
          ))}
        </div>

        <input
          className="create-rail__search"
          type="search"
          data-create-search
          placeholder={t('design.create.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="create-rail__head">
          <span className="create-rail__headLabel">{t('design.create.library')}</span>
          <button
            type="button"
            className="create-rail__headBtn"
            data-create-new-folder
            onClick={() => {
              setCreating('folder');
              setNewSetName('');
            }}
          >
            {t('design.create.newFolder')}
          </button>
          <button
            type="button"
            className="create-rail__headBtn create-rail__headBtn--strong"
            data-create-new-set
            onClick={() => {
              setCreating('set');
              setNewFolder('');
            }}
          >
            {t('design.create.newSet')}
          </button>
        </div>

        {error !== '' && (
          <p className="create-rail__error" role="alert" data-create-error>
            {error}
          </p>
        )}

        {creating === 'folder' && (
          <form
            className="create-rail__inline"
            data-create-folder-form
            onSubmit={(event) => {
              event.preventDefault();
              void submitFolder();
            }}
          >
            <input
              className="create-rail__input"
              autoFocus
              placeholder={t('design.create.folderName')}
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
            />
            <div className="create-rail__inlineActions">
              <button type="submit" className="create-rail__miniBtn" disabled={busy}>
                {t('design.create.save')}
              </button>
              <button type="button" className="create-rail__miniBtn" onClick={() => setCreating(null)}>
                {t('design.create.cancel')}
              </button>
            </div>
          </form>
        )}

        {creating === 'set' && (
          <form
            className="create-rail__inline"
            data-create-set-form
            onSubmit={(event) => {
              event.preventDefault();
              void submitSet();
            }}
          >
            <input
              className="create-rail__input"
              autoFocus
              placeholder={t('design.create.setName')}
              value={newSetName}
              onChange={(event) => setNewSetName(event.target.value)}
            />
            <select
              className="create-rail__input"
              value={newSetFolder}
              onChange={(event) => setNewSetFolder(event.target.value)}
            >
              <option value="">{t('design.create.unfiled')}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <div className="create-rail__inlineActions">
              <button type="submit" className="create-rail__miniBtn" disabled={busy}>
                {t('design.create.save')}
              </button>
              <button type="button" className="create-rail__miniBtn" onClick={() => setCreating(null)}>
                {t('design.create.cancel')}
              </button>
            </div>
          </form>
        )}

        {loadState === 'loading' && !library && (
          <p className="create-rail__note" data-create-loading>
            {t('design.common.loading')}
          </p>
        )}

        {loadState === 'failed' && (
          <div className="create-rail__note" data-create-failed>
            <p>{t('design.create.loadFailed')}</p>
            <button type="button" className="create-rail__miniBtn" onClick={() => void loadLibrary()}>
              {t('design.common.retry')}
            </button>
          </div>
        )}

        {folders.map((folder) => {
          const inFolder = visibleSets.filter((item) => item.folderId === folder.id);
          const isCollapsed = collapsed[folder.id] === true;
          const hiddenBySearch = needle !== '' && inFolder.length === 0;

          if (hiddenBySearch) return null;

          return (
            <div className="create-rail__folder" key={folder.id} data-create-folder={folder.id}>
              <div className="create-rail__row create-rail__row--folder">
                <button
                  type="button"
                  className="create-rail__rowMain"
                  onClick={() => setCollapsed({ ...collapsed, [folder.id]: !isCollapsed })}
                >
                  <span className={`create-rail__chev${isCollapsed ? ' create-rail__chev--closed' : ''}`}>
                    <Icon name="chev-down" />
                  </span>
                  <span className="create-rail__rowName">{folder.name}</span>
                  {folder.count > 0 && <span className="create-rail__rowCount">{folder.count}</span>}
                </button>
                <button
                  type="button"
                  className="create-rail__rowMenuBtn"
                  aria-label={t('design.create.manage', { name: folder.name })}
                  data-create-folder-menu={folder.id}
                  onClick={() =>
                    setMenu(menu !== null && menu.id === folder.id ? null : { kind: 'folder', id: folder.id })
                  }
                >
                  <span aria-hidden="true" className="create-rail__dots" />
                </button>

                {menu !== null && menu.kind === 'folder' && menu.id === folder.id && (
                  <div className="create-rail__menu" data-create-folder-menu-panel>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(null);
                        setRenaming({ kind: 'folder', id: folder.id, value: folder.name });
                      }}
                    >
                      {t('design.create.rename')}
                    </button>
                    <button
                      type="button"
                      className="create-rail__danger"
                      onClick={() => void removeFolder(folder.id, folder.name)}
                    >
                      {t('design.create.deleteFolder')}
                    </button>
                  </div>
                )}
              </div>

              {renaming !== null && renaming.kind === 'folder' && renaming.id === folder.id && (
                <form
                  className="create-rail__inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitRename();
                  }}
                >
                  <input
                    className="create-rail__input"
                    autoFocus
                    value={renaming.value}
                    onChange={(event) => setRenaming({ kind: 'folder', id: folder.id, value: event.target.value })}
                    onBlur={() => setRenaming(null)}
                  />
                </form>
              )}

              {!isCollapsed && (
                <div className="create-rail__children">
                  {inFolder.length === 0 ? (
                    <p className="create-rail__childEmpty">{t('design.create.folderEmpty')}</p>
                  ) : (
                    inFolder.map(renderSetRow)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {(unfiledTotal > 0 || folders.length === 0) && (
          <div className="create-rail__folder" data-create-folder="unfiled">
            <div className="create-rail__row create-rail__row--folder">
              <span className="create-rail__rowMain">
                <span className="create-rail__rowName">{t('design.create.unfiled')}</span>
                {unfiledTotal > 0 && <span className="create-rail__rowCount">{unfiledTotal}</span>}
              </span>
            </div>
            <div className="create-rail__children">
              {unfiled.length === 0 ? (
                <p className="create-rail__childEmpty">{t('design.create.setEmpty')}</p>
              ) : (
                unfiled.map(renderSetRow)
              )}
            </div>
          </div>
        )}

        {deletedSets.length > 0 && (
          <div className="create-rail__deleted" data-create-deleted>
            <button type="button" className="create-rail__deletedToggle" onClick={() => setShowDeleted(!showDeleted)}>
              {t('design.create.deleted', { n: String(deletedSets.length) })}
            </button>
            {showDeleted && (
              <div className="create-rail__children">
                {deletedSets.map((item) => (
                  <div className="create-rail__row" key={item.id} data-create-set-deleted={item.id}>
                    <span className="create-rail__rowMain">
                      <span className="create-rail__rowName">{item.name}</span>
                    </span>
                    <button type="button" className="create-rail__restore" onClick={() => void restoreSet(item.id)}>
                      {t('design.create.restore')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </aside>
      )}

      <div className="create-main" data-create-main>
        <div className="create-main__bar">
          <input
            className="create-main__search"
            type="search"
            data-create-projects-search
            placeholder={t('design.create.searchProjects')}
            value={projectsQuery}
            onChange={(event) => setProjectsQuery(event.target.value)}
          />
          <span className="create-main__count" data-create-count>
            {t('design.create.count', { n: String(projects.length), total: String(projects.length) })}
          </span>
          <button
            type="button"
            className="create-main__new"
            data-create-new-project
            onClick={() => setCreatingProject(!creatingProject)}
          >
            ＋ {t('design.create.newProject')}
          </button>
        </div>

        {creatingProject && (
          <form
            className="create-form"
            data-create-project-form
            onSubmit={(event) => {
              event.preventDefault();
              void submitProject();
            }}
          >
            <label>
              {t('design.create.projectTitle')}
              <input
                autoFocus
                value={newProjectTitle}
                onChange={(event) => setNewProjectTitle(event.target.value)}
              />
            </label>
            <label>
              {t('design.create.format')}
              <select
                value={newProjectFormat}
                onChange={(event) => setNewProjectFormat(event.target.value)}
              >
                <option value="">{t('design.create.all')}</option>
                {formats.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="create-form__actions">
              <button type="submit" className="create-rail__miniBtn" disabled={busy || newProjectFormat === ''}>
                {t('design.create.save')}
              </button>
              <button type="button" className="create-rail__miniBtn" onClick={() => setCreatingProject(false)}>
                {t('design.create.cancel')}
              </button>
            </div>
          </form>
        )}

        {projectsState === 'loading' && (
          <p className="create-empty" data-create-projects-loading>
            {t('design.common.loading')}
          </p>
        )}

        {projectsState === 'failed' && (
          <div className="create-empty" data-create-projects-failed>
            <p>{t('design.create.loadFailed')}</p>
            <button type="button" className="create-rail__miniBtn" onClick={() => void loadProjects()}>
              {t('design.common.retry')}
            </button>
          </div>
        )}

        {projectsState === 'ready' && projects.length === 0 && (
          <div className="create-empty" data-create-projects-empty>
            <p className="create-empty__title">{t('design.create.emptyTitle')}</p>
            <p className="create-empty__body">{t('design.create.emptyBody')}</p>
          </div>
        )}

        {projectsState === 'ready' && projects.length > 0 && (
          <div className="create-grid" data-create-grid>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                formatName={formats.find((f) => f.id === project.formatId)?.name ?? null}
                sets={sets}
                onDuplicate={() => void duplicateProjectCard(project)}
                onDelete={() => void removeProject(project)}
                onMove={(setId) => void moveProject(project, setId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard(props: {
  project: ProjectSummary;
  formatName: string | null;
  sets: ProjectSet[];
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (setId: string | null) => void;
}) {
  const { project, formatName, sets, onDuplicate, onDelete, onMove } = props;
  const [moving, setMoving] = useState(false);

  return (
    <div className="create-card" data-create-card={project.id}>
      <div className="create-card__cover">
        {project.coverFileId !== null ? (
          <img src={fileDownloadUrl(project.coverFileId)} alt="" />
        ) : (
          <span className="create-card__coverPlaceholder">{project.title}</span>
        )}
      </div>
      <div className="create-card__body">
        <div className="create-card__titleRow">
          <span className="create-card__title" title={project.title}>
            {project.title}
          </span>
          {formatName !== null && <span className="create-card__tag">{formatName}</span>}
        </div>
        <div className="create-card__actions">
          <button
            type="button"
            className="create-card__iconBtn"
            aria-label={t('design.create.duplicate')}
            data-create-card-duplicate={project.id}
            onClick={onDuplicate}
          >
            <Icon name="sparkle" />
          </button>
          <button
            type="button"
            className="create-card__iconBtn"
            aria-label={t('design.create.moveTo')}
            data-create-card-move={project.id}
            onClick={() => setMoving(!moving)}
          >
            <Icon name="panel" />
          </button>
          <button
            type="button"
            className="create-card__iconBtn"
            aria-label={t('design.create.delete')}
            data-create-card-delete={project.id}
            onClick={onDelete}
          >
            <Icon name="menu" />
          </button>
        </div>
        {moving && (
          <div className="create-rail__move">
            <span className="create-rail__moveLabel">{t('design.create.moveTo')}</span>
            <button type="button" className="create-rail__moveItem" onClick={() => { onMove(null); setMoving(false); }}>
              {t('design.create.unfiled')}
            </button>
            {sets
              .filter((s) => s.id !== project.setId)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="create-rail__moveItem"
                  onClick={() => {
                    onMove(s.id);
                    setMoving(false);
                  }}
                >
                  {s.name}
                </button>
              ))}
            <button type="button" className="create-rail__moveCancel" onClick={() => setMoving(false)}>
              {t('design.create.cancel')}
            </button>
          </div>
        )}
        <span className="create-card__time" data-create-card-time>
          {new Date(project.createdAt).toLocaleString('zh-HK', { hour12: false })}
        </span>
      </div>
    </div>
  );
}
