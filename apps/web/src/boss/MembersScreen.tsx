import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  assignStaffDepartment,
  createStaff,
  fetchModules,
  fetchStaff,
  type ApiFailure,
  type PublicModule,
  type StaffMember,
} from '../api';

/**
 * 人員與部門（issue #13）。
 *
 * 這一頁回答老闆兩個問題：**這間公司有誰**、**每個人屬於哪個部門**。
 * 兩件事都在同一張表上完成，因為分開兩頁會令「建立了員工但忘記指派部門」
 * 變成一個看不見的狀態 —— 那個人登入時只會被擋住，而老闆不知道為甚麼。
 *
 * 三條界線寫在程式裡：
 *
 * 1. **部門清單只有一個來源**：`GET /modules` 的 `department`。前端不寫死
 *    design／sales／hr 這些字，否則 manifest 改名之後，這裡會繼續送一個
 *    資料庫接受、但登入時找不到 app 的部門。
 * 2. **改部門是即時儲存，不是按「儲存」**。一次只改一個欄位，加一個確定
 *    步驟只會令人以為未儲存。失敗就把下拉還原成原本的值，並在該行講清楚
 *    —— 不假裝成功，也不留一個「畫面顯示 A、資料庫是 B」的狀態。
 * 3. **建立員工時不順便指派部門**。後端建立帳戶時 department 一定是
 *    `null`（issue #12 的決定），所以表單沒有部門欄位。員工建立之後會以
 *    「未指派」出現在表上，這一頁直接引導下一步，而不是假裝一步做完。
 */

/** 未指派部門時下拉的值。用空字串代表「沒有」，不用 `null`： `<option value>` 只收字串。 */
const NO_DEPARTMENT = '';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; staff: StaffMember[]; departments: PublicModule[]; total: number }
  | { kind: 'failed'; message: string };

function failureText(failure: ApiFailure, fallback: string): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  if (failure.reasons.length > 0) {
    return failure.reasons.join('；');
  }

  if (failure.message !== null) {
    return failure.message;
  }

  const known: Record<string, string> = {
    duplicate_email: t('staff.create.duplicateEmail'),
    unknown_department: t('boss.members.departmentUnknown'),
    owner_protected: t('staff.reset.ownerProtected'),
    not_found: t('boss.members.staffMissing'),
  };

  const mapped = failure.error === null ? undefined : known[failure.error];

  return mapped ?? (failure.error === null ? fallback : `${fallback}（${failure.error}）`);
}

export function MembersScreen() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [staffResult, modulesResult] = await Promise.all([
      fetchStaff({ limit: 100 }),
      fetchModules(),
    ]);

    if (!staffResult.ok) {
      setState({ kind: 'failed', message: failureText(staffResult.failure, t('staff.loadFailed')) });
      return;
    }

    if (!modulesResult.ok) {
      // 沒有部門清單就畫不出正確的下拉。這不是「0 個部門」，所以講讀取失敗。
      setState({
        kind: 'failed',
        message: failureText(modulesResult.failure, t('boss.members.departmentsFailed')),
      });
      return;
    }

    setState({
      kind: 'ready',
      staff: staffResult.data.staff,
      departments: modulesResult.data.modules.filter((item) => item.kind === 'department'),
      total: staffResult.data.total,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 只改一行，不重讀整張表：重讀會令畫面在儲存期間跳動。 */
  function replaceRow(next: StaffMember): void {
    setState((current) => {
      if (current.kind !== 'ready') {
        return current;
      }

      return {
        ...current,
        staff: current.staff.map((item) => (item.id === next.id ? next : item)),
      };
    });
  }

  async function handleDepartmentChange(member: StaffMember, value: string): Promise<void> {
    if (savingId !== null || state.kind !== 'ready') {
      return;
    }

    const next = value === NO_DEPARTMENT ? null : value;

    if (next === member.department) {
      return;
    }

    setSavingId(member.id);
    setRowError(null);

    const result = await assignStaffDepartment(member.id, next);

    setSavingId(null);

    if (result.ok) {
      replaceRow(result.data.staff);
      return;
    }

    // 失敗時下拉要回到真正的事實。controlled select 的值來自 member.department，
    // 所以「還原」＝ 不更新 state；但用戶已經選了，畫面會停在新值，因此這裡
    // 強制 re-render 一次（用 rowError 帶動）並在該行講清楚。
    setRowError({ id: member.id, message: failureText(result.failure, t('boss.members.departmentFailed')) });
    setState((current) => (current.kind === 'ready' ? { ...current, staff: [...current.staff] } : current));
  }

  async function handleCreate(): Promise<void> {
    if (creating) {
      return;
    }

    if (displayName.trim() === '' || email.trim() === '' || initialPassword === '') {
      setCreateError(t('boss.members.createMissing'));
      return;
    }

    setCreateError(null);
    setCreating(true);

    const result = await createStaff({
      displayName: displayName.trim(),
      email: email.trim(),
      initialPassword,
    });

    setCreating(false);

    if (!result.ok) {
      setCreateError(failureText(result.failure, t('boss.members.createFailed')));
      return;
    }

    // 密碼只活在表單的這次請求裡，成功後即清空。
    setInitialPassword('');
    setDisplayName('');
    setEmail('');
    setCreated(result.data.staff.displayName);
    void load();
  }

  if (state.kind === 'loading') {
    return (
      <p className="boss-note" role="status">
        {t('staff.loading')}
      </p>
    );
  }

  if (state.kind === 'failed') {
    return (
      <p className="boss-note boss-note--error" role="alert">
        {state.message}
      </p>
    );
  }

  return (
    <>
      <p className="boss-note">{t('boss.members.lead')}</p>

      {created !== null && (
        <p className="boss-note" role="status" data-member-created>
          {t('boss.members.created', { name: created })}
        </p>
      )}

      <div className="boss-members__bar">
        <p className="boss-members__count">{t('staff.total', { count: state.total })}</p>
        <button
          type="button"
          className="boss-btn boss-btn--primary"
          onClick={() => {
            setFormOpen((open) => !open);
            setCreateError(null);
          }}
        >
          {formOpen ? t('boss.members.createClose') : t('staff.create')}
        </button>
      </div>

      {formOpen && (
        <form
          className="boss-form boss-members__form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <p className="boss-form__step">{t('staff.create.hint')}</p>

          {/* 標籤用 htmlFor 明確綁定，而不是把輸入框包在 <label> 裡面：
              提示文字一包進去，控件嘅可讀名稱就會變成「初始密碼 員工第一次
              登入用呢個密碼…」，讀屏與測試都會捉到一長串。 */}
          <div className="boss-field">
            <label className="boss-field__label" htmlFor="member-display-name">
              {t('staff.field.displayName')}
            </label>
            <input
              id="member-display-name"
              className="boss-input"
              name="displayName"
              value={displayName}
              autoComplete="off"
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
            />
          </div>

          <div className="boss-field">
            <label className="boss-field__label" htmlFor="member-email">
              {t('staff.field.email')}
            </label>
            <input
              id="member-email"
              className="boss-input"
              name="email"
              type="email"
              value={email}
              autoComplete="off"
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </div>

          <div className="boss-field">
            <label className="boss-field__label" htmlFor="member-initial-password">
              {t('staff.field.initialPassword')}
            </label>
            <input
              id="member-initial-password"
              className="boss-input"
              name="initialPassword"
              type="password"
              value={initialPassword}
              autoComplete="new-password"
              aria-describedby="member-initial-password-hint"
              onChange={(event) => {
                setInitialPassword(event.target.value);
              }}
            />
            <span className="boss-field__hint" id="member-initial-password-hint">
              {t('boss.members.passwordHint')}
            </span>
          </div>

          {createError !== null && (
            <p className="boss-note boss-note--error" role="alert">
              {createError}
            </p>
          )}

          <div className="boss-form__actions">
            <button type="submit" className="boss-btn boss-btn--primary" disabled={creating}>
              {creating ? t('staff.create.busy') : t('staff.create.submit')}
            </button>
            <button
              type="button"
              className="boss-btn"
              onClick={() => {
                setFormOpen(false);
                setCreateError(null);
              }}
            >
              {t('boss.members.createCancel')}
            </button>
          </div>
        </form>
      )}

      {state.staff.length === 0 ? (
        <p className="boss-empty">{t('staff.empty')}</p>
      ) : (
        <div className="boss-sites-card boss-members">
          <table className="boss-sites">
            <thead>
              <tr>
                <th scope="col">{t('boss.members.col.member')}</th>
                <th scope="col">{t('boss.members.col.department')}</th>
                <th scope="col">{t('boss.members.col.state')}</th>
                <th scope="col">{t('staff.field.createdAt')}</th>
              </tr>
            </thead>
            <tbody>
              {state.staff.map((member) => {
                const unavailable =
                  member.department === null
                    ? null
                    : state.departments.find((item) => item.department === member.department)
                        ?.available;

                return (
                  <tr key={member.id} data-member-row data-member-email={member.email}>
                    <td>
                      <span className="boss-sites__name">{member.displayName}</span>
                      <span className="boss-sites__meta">{member.email}</span>
                      {rowError !== null && rowError.id === member.id && (
                        <span className="boss-members__error" role="alert" data-member-error>
                          {rowError.message}
                        </span>
                      )}
                    </td>
                    <td data-label={t('boss.members.col.department')}>
                      <select
                        className="boss-input boss-select"
                        aria-label={t('boss.members.assignLabel', { name: member.displayName })}
                        value={member.department ?? NO_DEPARTMENT}
                        disabled={savingId === member.id || member.disabledAt !== null}
                        onChange={(event) => {
                          void handleDepartmentChange(member, event.target.value);
                        }}
                      >
                        <option value={NO_DEPARTMENT}>{t('boss.members.unassigned')}</option>
                        {state.departments.map((department) => (
                          <option key={department.id} value={department.department ?? ''}>
                            {department.available
                              ? department.title
                              : `${department.title}${t('boss.members.notOpen')}`}
                          </option>
                        ))}
                      </select>
                      {savingId === member.id && (
                        <span className="boss-field__hint" role="status">
                          {t('boss.members.saving')}
                        </span>
                      )}
                    </td>
                    <td data-label={t('boss.members.col.state')}>
                      {member.disabledAt === null ? (
                        <span className="boss-sites__status">{t('staff.state.active')}</span>
                      ) : (
                        <span className="boss-sites__dim">{t('boss.members.disabled')}</span>
                      )}
                      {member.mustChangePassword && member.disabledAt === null && (
                        <span className="boss-sites__meta">{t('staff.mustChange.yes')}</span>
                      )}
                      {unavailable === false && (
                        <span className="boss-sites__meta">{t('boss.members.notOpenNote')}</span>
                      )}
                    </td>
                    <td className="boss-sites__fp" data-label={t('staff.field.createdAt')}>
                      {new Date(member.createdAt).toLocaleDateString('zh-HK')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="boss-sites-card__note">{t('boss.members.footnote')}</p>
        </div>
      )}
    </>
  );
}
