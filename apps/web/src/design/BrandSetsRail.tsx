import { Icon } from '@company-os/app-shell';
import { t, type MessageKey } from '@company-os/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import {
  createBrandSet,
  createBrandSetFolder,
  deleteBrandSet,
  deleteBrandSetFolder,
  duplicateBrandSet,
  layerExportUrl,
  renameBrandSetFolder,
  restoreBrandSet,
  updateBrandSet,
  type BrandSet,
  type BrandSetTree,
  type GuideStage,
  type LayerKind,
} from '../api';

/**
 * 品牌模組左欄：品牌總覽（01–03）＋ 品牌集（04A–04H）的收納樹。
 *
 * 老闆 2026-11-17：04A–04H 不是品牌的一部分，而是「一套做法」。同一個品牌
 * 一年可以有好幾套（夏季／冬季…），每套都可以重複套用到任何產品／設計／
 * 輸出，所以要有資料夾、要搬得走、要複製、要安全刪除。
 *
 * 規則寫在這裡，因為這裡是唯一入口：
 *   1. 資料夾只是分類。刪資料夾不會刪品牌集（裡面的回到未分類）。
 *   2. 刪品牌集是安全刪除：搬到「已刪除」，可以還原，資料不會人間蒸發。
 *   3. 改名、搬移、複製都會即時反映在樹上 —— 看不到的改動等於沒做。
 */

type Menu = { kind: 'set' | 'folder'; id: string } | null;

type Rename = { kind: 'set' | 'folder'; id: string; value: string } | null;

export type BrandRailTarget =
  | { kind: 'overview' }
  | { kind: 'stage'; stage: GuideStage }
  | { kind: 'set'; setId: string };

/**
 * 五個用途組：左欄導航主軸（老闆 2026-11-18 定）。
 *
 * 卡（stage）照舊一張張列出、有編號有選項有 prompt，只是按「用途」分組排列：
 * 每個組回答一條問題 —— 規則與原因、鎖死數值、限制版面、教味道、檢查複核。
 * 品牌集（04B–04E、04H）仍是多套，所以「品牌層卡」直接點開，品牌集卡標示
 * 歸屬，實際收納管理仍交給下面的品牌集樹。
 */

type LayerGroup = {
  nameKey: MessageKey;
  /** 可匯出 .md 的層（design.md／tokens）；其餘組是 null，不顯示匯出按鈕。 */
  exportKind: LayerKind | null;
  /** 品牌層卡：直接點開（/stage/<stage>）。 */
  brandStages: readonly { stage: GuideStage; num: string; nameKey: MessageKey }[];
  /** 品牌集卡：住在品牌集，點開會跳到品牌集樹（由 onOpenSetStages 收）。 */
  setStages: readonly { stage: GuideStage; num: string; nameKey: MessageKey }[];
};

const LAYER_GROUPS: readonly LayerGroup[] = [
  {
    nameKey: 'brandBuild.layer.design',
    exportKind: 'design-doc',
    brandStages: [
      { stage: 'stage1', num: '01', nameKey: 'brandBuild.stage.stage1' },
      { stage: 'stage2', num: '02', nameKey: 'brandBuild.stage.stage2' },
      { stage: 'stage3', num: '03', nameKey: 'brandBuild.stage.stage3' },
      { stage: 'stage4a', num: '04A', nameKey: 'brandBuild.stage.stage4a' },
    ],
    setStages: [],
  },
  {
    nameKey: 'brandBuild.layer.tokens',
    exportKind: 'tokens',
    brandStages: [],
    setStages: [
      { stage: 'stage4b', num: '04B', nameKey: 'brandBuild.stage.stage4b' },
      { stage: 'stage4c', num: '04C', nameKey: 'brandBuild.stage.stage4c' },
      { stage: 'stage4d', num: '04D', nameKey: 'brandBuild.stage.stage4d' },
      { stage: 'stage4e', num: '04E', nameKey: 'brandBuild.stage.stage4e' },
    ],
  },
  {
    nameKey: 'brandBuild.layer.templates',
    exportKind: null,
    brandStages: [],
    setStages: [{ stage: 'stage4f', num: '04F', nameKey: 'brandBuild.stage.stage4f' }],
  },
  {
    nameKey: 'brandBuild.layer.examples',
    exportKind: null,
    brandStages: [],
    setStages: [{ stage: 'stage4h', num: '04H', nameKey: 'brandBuild.stage.stage4h' }],
  },
  {
    nameKey: 'brandBuild.layer.checks',
    exportKind: null,
    brandStages: [{ stage: 'stage4g', num: '04G', nameKey: 'brandBuild.stage.stage4g' }],
    setStages: [],
  },
];

export function BrandSetsRail(props: {
  brandId: string;
  tree: BrandSetTree | null;
  loadState: 'loading' | 'ready' | 'failed';
  target: BrandRailTarget;
  onOpenOverview: () => void;
  /** 開品牌層的固定階段（01–03、04A、04G）。 */
  onOpenStage: (stage: GuideStage) => void;
  /** 開品牌集內的一個階段（04B–04E、04F、04H）：由 BrandScreen 判斷套哪一套品牌集。 */
  onOpenSetStage: (stage: GuideStage) => void;
  onOpenSet: (setId: string) => void;
  onChanged: () => void;
  onRetry: () => void;
}) {
  const { brandId, tree, loadState, target, onOpenOverview, onOpenStage, onOpenSetStage, onOpenSet, onChanged, onRetry } =
    props;

  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Rename>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<'folder' | 'set' | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [newSetFolder, setNewSetFolder] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  // 關掉任何 popover：按 Esc 或者換頁都應該收。
  useEffect(() => {
    if (menu === null && movingId === null) {
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenu(null);
        setMovingId(null);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [menu, movingId]);

  useEffect(() => {
    setMenu(null);
    setMovingId(null);
  }, [target.kind, target.kind === 'set' ? target.setId : '']);

  const sets = tree?.sets ?? [];
  const folders = tree?.folders ?? [];
  const needle = query.trim().toLowerCase();
  const match = (name: string): boolean => needle === '' || name.toLowerCase().includes(needle);

  const visibleSets = sets.filter((item) => match(item.name));
  const unfiled = visibleSets.filter((item) => item.folderId === null);
  const unfiledTotal = sets.filter((item) => item.folderId === null).length;

  async function run(task: () => Promise<{ ok: boolean; error?: string }>): Promise<void> {
    setBusy(true);
    setError('');
    const result = await task();
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? t('brandBuild.set.failed'));
      return;
    }

    onChanged();
  }

  async function submitFolder(): Promise<void> {
    const name = newFolder.trim();

    if (name === '') {
      return;
    }

    await run(async () => {
      const result = await createBrandSetFolder(brandId, name);
      return result.ok ? { ok: true } : { ok: false, error: t('brandBuild.set.failed') };
    });
    setNewFolder('');
    setCreating(null);
  }

  async function submitSet(): Promise<void> {
    const name = newSetName.trim();

    if (name === '') {
      return;
    }

    await run(async () => {
      const result = await createBrandSet(brandId, {
        name,
        folderId: newSetFolder === '' ? null : newSetFolder,
      });

      if (!result.ok) {
        return { ok: false, error: t('brandBuild.set.failed') };
      }

      setNewSetName('');
      setCreating(null);
      onOpenSet(result.data.id);
      return { ok: true };
    });
  }

  async function submitRename(): Promise<void> {
    if (renaming === null) {
      return;
    }

    const value = renaming.value.trim();

    if (value === '') {
      return;
    }

    const { kind, id } = renaming;
    setRenaming(null);

    await run(async () => {
      if (kind === 'folder') {
        const result = await renameBrandSetFolder(id, value);
        return result.ok ? { ok: true } : { ok: false, error: t('brandBuild.set.failed') };
      }

      const result = await updateBrandSet(id, { name: value });

      if (result.ok) {
        return { ok: true };
      }

      return {
        ok: false,
        error:
          result.failure.kind === 'http' && result.failure.status === 409
            ? t('brandBuild.set.nameTaken')
            : t('brandBuild.set.failed'),
      };
    });
  }

  async function moveSet(setId: string, folderId: string | null): Promise<void> {
    setMovingId(null);

    await run(async () => {
      const result = await updateBrandSet(setId, { folderId });
      return result.ok ? { ok: true } : { ok: false, error: t('brandBuild.set.failed') };
    });
  }

  async function duplicate(set: BrandSet): Promise<void> {
    setMenu(null);

    await run(async () => {
      const result = await duplicateBrandSet(set.id, {
        name: t('brandBuild.set.copyName', { name: set.name }),
      });

      if (!result.ok) {
        return { ok: false, error: t('brandBuild.set.failed') };
      }

      onOpenSet(result.data.id);
      return { ok: true };
    });
  }

  async function removeSet(set: BrandSet): Promise<void> {
    setMenu(null);

    if (!window.confirm(t('brandBuild.set.deleteConfirm', { name: set.name }))) {
      return;
    }

    await run(async () => {
      const result = await deleteBrandSet(set.id);
      return result.ok ? { ok: true } : { ok: false, error: t('brandBuild.set.failed') };
    });
  }

  async function removeFolder(id: string, name: string): Promise<void> {
    setMenu(null);

    if (!window.confirm(t('brandBuild.set.deleteFolderConfirm', { name }))) {
      return;
    }

    await run(async () => {
      const result = await deleteBrandSetFolder(id);
      return result.ok ? { ok: true } : { ok: false, error: t('brandBuild.set.failed') };
    });
  }

  async function restore(id: string): Promise<void> {
    await run(async () => {
      const result = await restoreBrandSet(id);
      return result.ok ? { ok: true } : { ok: false, error: t('brandBuild.set.failed') };
    });
  }

  function renderSetRow(set: BrandSet): ReactNode {
    const active = target.kind === 'set' && target.setId === set.id;

    if (renaming !== null && renaming.kind === 'set' && renaming.id === set.id) {
      return (
        <form
          className="brand-rail__inline"
          key={set.id}
          onSubmit={(event) => {
            event.preventDefault();
            void submitRename();
          }}
        >
          <input
            className="brand-rail__input"
            data-brand-rename-input
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
        <div className="brand-rail__move" data-brand-move-menu key={set.id}>
          <span className="brand-rail__moveLabel">{t('brandBuild.set.moveTo')}</span>
          <button type="button" className="brand-rail__moveItem" onClick={() => void moveSet(set.id, null)}>
            {t('brandBuild.set.unfiled')}
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="brand-rail__moveItem"
              onClick={() => void moveSet(set.id, folder.id)}
            >
              {folder.name}
            </button>
          ))}
          <button type="button" className="brand-rail__moveCancel" onClick={() => setMovingId(null)}>
            {t('brandBuild.edit.cancel')}
          </button>
        </div>
      );
    }

    return (
      <div
        key={set.id}
        className={`brand-rail__row${active ? ' brand-rail__row--active' : ''}`}
        data-brand-set-row={set.id}
      >
        <button type="button" className="brand-rail__rowMain" onClick={() => onOpenSet(set.id)}>
          <span className="brand-rail__rowName">{set.name}</span>
          {set.filled > 0 && (
            <span className="brand-rail__rowBadge" title={t('brandBuild.set.filled', { n: String(set.filled) })}>
              {set.filled}
            </span>
          )}
        </button>
        <button
          type="button"
          className="brand-rail__rowMenuBtn"
          aria-label={t('brandBuild.set.manage', { name: set.name })}
          data-brand-set-menu={set.id}
          onClick={() => setMenu(menu !== null && menu.id === set.id ? null : { kind: 'set', id: set.id })}
        >
          <span aria-hidden="true" className="brand-rail__dots" />
        </button>

        {menu !== null && menu.kind === 'set' && menu.id === set.id && (
          <div className="brand-rail__menu" data-brand-set-menu-panel>
            <button type="button" onClick={() => { setMenu(null); onOpenSet(set.id); }}>
              {t('brandBuild.set.open')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setRenaming({ kind: 'set', id: set.id, value: set.name });
              }}
            >
              {t('brandBuild.set.rename')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setMovingId(set.id);
              }}
            >
              {t('brandBuild.set.move')}
            </button>
            <button type="button" onClick={() => void duplicate(set)}>
              {t('brandBuild.set.duplicate')}
            </button>
            <button type="button" className="brand-rail__danger" onClick={() => void removeSet(set)}>
              {t('brandBuild.set.delete')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="brand-rail" data-brand-rail aria-label={t('brandBuild.set.rail')}>
      <input
        className="brand-rail__search"
        type="search"
        data-brand-set-search
        placeholder={t('brandBuild.set.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <button
        type="button"
        className={`brand-rail__overview${target.kind === 'overview' ? ' brand-rail__overview--active' : ''}`}
        data-brand-rail-overview
        onClick={onOpenOverview}
      >
        <span>{t('brandBuild.overview.nav')}</span>
        <small>{t('brandBuild.set.coreRange')}</small>
      </button>

      {LAYER_GROUPS.map((group) => (
        <div className="brand-rail__layerGroup" key={group.nameKey} data-brand-rail-group={group.nameKey}>
          <div className="brand-rail__layerHead">
            <span className="brand-rail__layerHeadLabel">{t(group.nameKey)}</span>
            {group.exportKind !== null && (
              <a
                className="brand-rail__layerExport"
                href={layerExportUrl(brandId, group.exportKind)}
                data-brand-rail-export={group.exportKind}
                title={t('brandBuild.layer.export')}
              >
                {t('brandBuild.layer.export')}
              </a>
            )}
          </div>

          {group.brandStages.map((entry) => (
            <button
              key={entry.stage}
              type="button"
              className={`brand-rail__overview brand-rail__stage${
                target.kind === 'stage' && target.stage === entry.stage ? ' brand-rail__overview--active' : ''
              }`}
              data-brand-rail-stage={entry.stage}
              onClick={() => onOpenStage(entry.stage)}
            >
              <span>{t(entry.nameKey)}</span>
              <small>{entry.num}</small>
            </button>
          ))}

          {group.setStages.map((entry) => (
            <button
              key={entry.stage}
              type="button"
              className={`brand-rail__overview brand-rail__stage brand-rail__stage--set${
                target.kind === 'stage' && target.stage === entry.stage ? ' brand-rail__overview--active' : ''
              }`}
              data-brand-rail-set-stage={entry.stage}
              onClick={() => onOpenSetStage(entry.stage)}
            >
              <span>{t(entry.nameKey)}</span>
              <small>{entry.num}</small>
            </button>
          ))}
        </div>
      ))}

      <div className="brand-rail__head">
        <span className="brand-rail__headLabel">{t('brandBuild.set.title')}</span>
        <button
          type="button"
          className="brand-rail__headBtn"
          data-brand-new-folder
          onClick={() => {
            setCreating('folder');
            setNewSetName('');
          }}
        >
          {t('brandBuild.set.newFolder')}
        </button>
        <button
          type="button"
          className="brand-rail__headBtn brand-rail__headBtn--strong"
          data-brand-new-set
          onClick={() => {
            setCreating('set');
            setNewFolder('');
          }}
        >
          {t('brandBuild.set.newSet')}
        </button>
      </div>

      {error !== '' && (
        <p className="brand-rail__error" role="alert" data-brand-set-error>
          {error}
        </p>
      )}

      {creating === 'folder' && (
        <form
          className="brand-rail__inline"
          data-brand-folder-form
          onSubmit={(event) => {
            event.preventDefault();
            void submitFolder();
          }}
        >
          <input
            className="brand-rail__input"
            autoFocus
            placeholder={t('brandBuild.set.folderName')}
            value={newFolder}
            onChange={(event) => setNewFolder(event.target.value)}
          />
          <div className="brand-rail__inlineActions">
            <button type="submit" className="brand-rail__miniBtn" disabled={busy}>
              {t('brandBuild.edit.save')}
            </button>
            <button type="button" className="brand-rail__miniBtn" onClick={() => setCreating(null)}>
              {t('brandBuild.edit.cancel')}
            </button>
          </div>
        </form>
      )}

      {creating === 'set' && (
        <form
          className="brand-rail__inline brand-rail__inline--stack"
          data-brand-set-form
          onSubmit={(event) => {
            event.preventDefault();
            void submitSet();
          }}
        >
          <input
            className="brand-rail__input"
            autoFocus
            placeholder={t('brandBuild.set.setName')}
            value={newSetName}
            onChange={(event) => setNewSetName(event.target.value)}
          />
          <select
            className="brand-rail__input"
            value={newSetFolder}
            onChange={(event) => setNewSetFolder(event.target.value)}
          >
            <option value="">{t('brandBuild.set.unfiled')}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <div className="brand-rail__inlineActions">
            <button type="submit" className="brand-rail__miniBtn" disabled={busy}>
              {t('brandBuild.edit.save')}
            </button>
            <button type="button" className="brand-rail__miniBtn" onClick={() => setCreating(null)}>
              {t('brandBuild.edit.cancel')}
            </button>
          </div>
        </form>
      )}

      {loadState === 'loading' && !tree && (
        <p className="brand-rail__note" data-brand-sets-loading>
          {t('brandBuild.loading')}
        </p>
      )}

      {loadState === 'failed' && (
        <div className="brand-rail__note" data-brand-sets-failed>
          <p>{t('brandBuild.set.loadFailed')}</p>
          <button type="button" className="brand-rail__miniBtn" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {folders.map((folder) => {
        const inFolder = visibleSets.filter((item) => item.folderId === folder.id);
        const isCollapsed = collapsed[folder.id] === true;
        const hiddenBySearch = needle !== '' && inFolder.length === 0;

        if (hiddenBySearch) {
          return null;
        }

        return (
          <div className="brand-rail__folder" key={folder.id} data-brand-folder={folder.id}>
            <div className="brand-rail__row brand-rail__row--folder">
              <button
                type="button"
                className="brand-rail__rowMain"
                onClick={() => setCollapsed({ ...collapsed, [folder.id]: !isCollapsed })}
              >
                <span className={`brand-rail__chev${isCollapsed ? ' brand-rail__chev--closed' : ''}`}>
                  <Icon name="chev-down" />
                </span>
                <span className="brand-rail__rowName">{folder.name}</span>
                {folder.count > 0 && <span className="brand-rail__rowCount">{folder.count}</span>}
              </button>
              <button
                type="button"
                className="brand-rail__rowMenuBtn"
                aria-label={t('brandBuild.set.manage', { name: folder.name })}
                data-brand-folder-menu={folder.id}
                onClick={() => setMenu(menu !== null && menu.id === folder.id ? null : { kind: 'folder', id: folder.id })}
              >
                <span aria-hidden="true" className="brand-rail__dots" />
              </button>

              {menu !== null && menu.kind === 'folder' && menu.id === folder.id && (
                <div className="brand-rail__menu" data-brand-folder-menu-panel>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setRenaming({ kind: 'folder', id: folder.id, value: folder.name });
                    }}
                  >
                    {t('brandBuild.set.rename')}
                  </button>
                  <button type="button" className="brand-rail__danger" onClick={() => void removeFolder(folder.id, folder.name)}>
                    {t('brandBuild.set.deleteFolder')}
                  </button>
                </div>
              )}
            </div>

            {renaming !== null && renaming.kind === 'folder' && renaming.id === folder.id && (
              <form
                className="brand-rail__inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRename();
                }}
              >
                <input
                  className="brand-rail__input"
                  autoFocus
                  value={renaming.value}
                  onChange={(event) =>
                    setRenaming({ kind: 'folder', id: folder.id, value: event.target.value })
                  }
                  onBlur={() => setRenaming(null)}
                />
              </form>
            )}

            {!isCollapsed && (
              <div className="brand-rail__children">
                {inFolder.length === 0 ? (
                  <p className="brand-rail__childEmpty">{t('brandBuild.set.folderEmpty')}</p>
                ) : (
                  inFolder.map(renderSetRow)
                )}
              </div>
            )}
          </div>
        );
      })}

      {(unfiledTotal > 0 || folders.length === 0) && (
        <div className="brand-rail__folder" data-brand-folder="unfiled">
          <div className="brand-rail__row brand-rail__row--folder">
            <span className="brand-rail__rowMain">
              <span className="brand-rail__rowName">{t('brandBuild.set.unfiled')}</span>
              {unfiledTotal > 0 && <span className="brand-rail__rowCount">{unfiledTotal}</span>}
            </span>
          </div>
          <div className="brand-rail__children">
            {unfiled.length === 0 ? (
              <p className="brand-rail__childEmpty">{t('brandBuild.set.empty')}</p>
            ) : (
              unfiled.map(renderSetRow)
            )}
          </div>
        </div>
      )}

      {(tree?.deleted.length ?? 0) > 0 && (
        <div className="brand-rail__deleted" data-brand-sets-deleted>
          <button type="button" className="brand-rail__deletedToggle" onClick={() => setShowDeleted(!showDeleted)}>
            {t('brandBuild.set.deleted', { n: String(tree?.deleted.length ?? 0) })}
          </button>
          {showDeleted && (
            <div className="brand-rail__children">
              {(tree?.deleted ?? []).map((item) => (
                <div className="brand-rail__row" key={item.id} data-brand-set-deleted={item.id}>
                  <span className="brand-rail__rowMain">
                    <span className="brand-rail__rowName">{item.name}</span>
                  </span>
                  <button type="button" className="brand-rail__restore" onClick={() => void restore(item.id)}>
                    {t('brandBuild.set.restore')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 「未有品牌集」只講一次：上面「未分類」那一段已經講了。 */}
    </aside>
  );
}
