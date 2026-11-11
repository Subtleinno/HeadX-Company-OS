import { Fragment, useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { BrandEditorsPanel } from './BrandEditorsPanel';
import {
  assignStaffDepartment,
  createStaff,
  disableStaff,
  enableStaff,
  fetchModules,
  fetchStaff,
  resetStaffPassword,
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
 * 3. **建立員工時可以一併選部門**（issue #28，C92「建立時就要選部門」）。
 *    選了就在同一個請求送 `department`；沒選就送 `null`，並即刻講清楚後果
 *    （「佢登入會被擋」）。先建人、再回頭找那一行指派，中間會有一個
 *    「帳戶存在但登入即被擋」的狀態 —— 對老闆只是多按一下，對那個人是
 *    「我入唔到系統」。建完之後仍然可以在表上改，因為部門會變、人也會調。
 *
 * 停用與重設密碼（issue #24）刻意放在同一張表的每一行：這兩件事都是
 * 「這個人仲可不可以用這個身份進來」，跟部門是同一個問題的三面。停用之前
 * 一定先講後果再確認 —— 按下停用不會即刻生效，因為它會把一個正在工作的人
 * 踢出系統。重設密碼一定要老闆自己再打一次密碼：留在公共電腦上的 session
 * 不應該可以改掉另一個人的密碼（後端真的驗，前端沒有任何旗標可代替）。
 *
 * 恢復（issue #30）是停用的逆操作，所以它出現在**停用之後的那一行**，而且
 * 只有它：一個停了的人身上可以做的就只有「讓他回來」，重設密碼與改部門都
 * 要等他回來之後才有意義。恢復不需要確認面板（它不會踢人、可以再按一次停用
 * 還原），但成功之後不可以只講「已恢復」—— 如果他仍然未指派部門、或者部門
 * app 未開放，他登入一樣見不到任何畫面，這一句要同時講出來。
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
    // 停用與重設（issue #24）：每個原因講自己的話，不互相借用。
    already_disabled: t('staff.disable.already'),
    not_disabled: t('staff.enable.notDisabled'),
    invalid_owner_password: t('staff.reset.wrongOwnerPassword'),
    stale_credentials: t('staff.reset.staleCredentials'),
    too_many_attempts: t('boss.members.tooManyAttempts'),
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
  /**
   * 建立時順便選的部門（issue #28，C92「建立時就要選部門」）。
   *
   * 預設是「未指派」而不是強制選一個：部門會變、人也會調，強制填一個
   * 只會令人亂揀一個來過關。但下拉就在表單上，不必建立完再回頭找那一行。
   */
  const [newDepartment, setNewDepartment] = useState(NO_DEPARTMENT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; departmentTitle: string | null } | null>(
    null,
  );

  /**
   * 停用與重設密碼（issue #24）的面板。一次只開一個：同一個人身上不會同時
   * 發生兩件事，兩個面板一齊開只會令人不知道按哪個確認才算數。
   */
  const [panel, setPanel] = useState<{ id: string; kind: 'disable' | 'reset' } | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);

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

  function openPanel(member: StaffMember, kind: 'disable' | 'reset'): void {
    setPanel({ id: member.id, kind });
    setOwnerPassword('');
    setTempPassword('');
    setActionError(null);
    setActionDone(null);
  }

  /** 收起面板時把密碼清掉：留著只會令下一個開面板的人見到上一手打過的密碼。 */
  function closePanel(): void {
    setPanel(null);
    setOwnerPassword('');
    setTempPassword('');
    setActionError(null);
  }

  async function handleDisable(member: StaffMember): Promise<void> {
    if (actingId !== null) {
      return;
    }

    setActingId(member.id);
    setActionError(null);

    const result = await disableStaff(member.id);

    setActingId(null);

    if (!result.ok) {
      setActionError({
        id: member.id,
        message: failureText(result.failure, t('boss.members.actionFailed')),
      });
      return;
    }

    replaceRow(result.data.staff);
    setPanel(null);
    setActionDone(t('staff.disable.done'));
  }

  /**
   * 恢復停用帳戶（issue #30）。沒有確認面板：它不踢人，按錯了再按一次停用
   * 就還原。但成功之後一定要講清楚「他是否真的入得到」—— 恢復只解開登入，
   * 未指派部門或者部門未開放的話，他照樣見不到任何畫面。
   */
  async function handleEnable(member: StaffMember): Promise<void> {
    if (actingId !== null) {
      return;
    }

    setActingId(member.id);
    setActionError(null);

    const result = await enableStaff(member.id);

    setActingId(null);

    if (!result.ok) {
      setActionError({
        id: member.id,
        message: failureText(result.failure, t('boss.members.actionFailed')),
      });
      return;
    }

    const restored = result.data.staff;

    replaceRow(restored);

    // 兩個後果取自**伺服器回來的**那一列，不是按下之前的畫面：部門可能
    // 在停用期間被改過，用舊值會講錯話。
    const department =
      restored.department === null || state.kind !== 'ready'
        ? undefined
        : state.departments.find((item) => item.department === restored.department);

    const warning =
      restored.department === null
        ? t('boss.members.enabledNoDepartment')
        : department?.available === false
          ? t('boss.members.enabledDepartmentClosed')
          : '';

    setActionDone(t('staff.enable.done', { name: restored.displayName }) + warning);
  }

  async function handleReset(member: StaffMember): Promise<void> {
    if (actingId !== null) {
      return;
    }

    if (ownerPassword === '' || tempPassword === '') {
      setActionError({ id: member.id, message: t('boss.members.resetMissing') });
      return;
    }

    setActingId(member.id);
    setActionError(null);

    const result = await resetStaffPassword(member.id, {
      ownerPassword,
      newTemporaryPassword: tempPassword,
    });

    setActingId(null);

    if (!result.ok) {
      // 失敗時密碼欄照留：叫老闆由頭打一次兩串密碼，只是無謂的懲罰。
      setActionError({
        id: member.id,
        message: failureText(result.failure, t('boss.members.actionFailed')),
      });
      return;
    }

    // 這兩串密碼只活在剛才那一次請求裡：成功即刻清掉，面板亦收起。
    setOwnerPassword('');
    setTempPassword('');
    setPanel(null);
    replaceRow(result.data.staff);
    setActionDone(t('staff.reset.done'));
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
      // 一次請求講齊「這個人是誰、在哪個部門」。分兩次送，中間會有一個
      // 帳戶存在但登入即被擋的狀態。
      department: newDepartment === NO_DEPARTMENT ? null : newDepartment,
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
    setNewDepartment(NO_DEPARTMENT);

    const assigned = result.data.staff.department;
    // 講「已指派到設計部」，而不是講「已指派到 design」。後者是 schema 名，
    // 是給程式看的；老闆看的是部門叫什麼。
    const title =
      assigned === null
        ? null
        : ((state.kind === 'ready'
            ? state.departments.find((item) => (item.department ?? item.id) === assigned)?.title
            : undefined) ?? assigned);

    setCreated({ name: result.data.staff.displayName, departmentTitle: title });
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
      {created !== null && (
        <p className="boss-note" role="status" data-member-created>
          {t('boss.members.created', { name: created.name })}
          {/* 不加前導空格：中文句號後面直接接下一句，加了會見到「。 已指派」。 */}
          {created.departmentTitle === null
            ? t('boss.members.createdUnassigned')
            : t('boss.members.createdIn', { department: created.departmentTitle })}
        </p>
      )}

      {actionDone !== null && (
        <p className="boss-note" role="status" data-member-action-done>
          {actionDone}
        </p>
      )}

      <div className="boss-members__bar">
        <p className="boss-members__count">{t('staff.total', { count: state.total })}</p>
        <button
          type="button"
          className={formOpen ? 'boss-btn' : 'boss-btn boss-btn--primary'}
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

          {/* 部門放密碼之前：先講「這個人屬於邊個部門」，再講「用邊個密碼入嚟」。
              密碼是最後一格，符合填表習慣，也代表它是最不該留在畫面上的一格。 */}
          <div className="boss-field">
            <label className="boss-field__label" htmlFor="member-department">
              {t('boss.members.newDepartment')}
            </label>
            <select
              id="member-department"
              className="boss-input boss-select"
              name="department"
              value={newDepartment}
              aria-describedby="member-department-hint"
              onChange={(event) => {
                setNewDepartment(event.target.value);
              }}
            >
              <option value={NO_DEPARTMENT}>{t('boss.members.unassigned')}</option>
              {state.departments.map((department) => (
                <option key={department.id} value={department.department ?? NO_DEPARTMENT}>
                  {department.available
                    ? department.title
                    : `${department.title}${t('boss.members.notOpen')}`}
                </option>
              ))}
            </select>
            <span className="boss-field__hint" id="member-department-hint">
              {t('boss.members.newDepartmentHint')}
            </span>
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
          </div>
        </form>
      )}

      {state.staff.length === 0 ? (
        <p className="boss-empty">
          {t('boss.members.empty')}{' '}
          <button
            type="button"
            className="boss-link"
            onClick={() => {
              setFormOpen(true);
            }}
          >
            {t('boss.members.createFirst')}
          </button>
        </p>
      ) : (
        <div className="boss-sites-card boss-members">
          <table className="boss-sites boss-members__table">
            <thead>
              <tr>
                <th scope="col">{t('boss.members.col.member')}</th>
                <th scope="col">{t('boss.members.col.department')}</th>
                <th scope="col">{t('boss.members.col.state')}</th>
                <th scope="col">{t('staff.field.createdAt')}</th>
                <th scope="col">{t('boss.members.col.actions')}</th>
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
                  <Fragment key={member.id}>
                    <tr data-member-row data-member-email={member.email}>
                    <td>
                      <span className="boss-sites__name">{member.displayName}</span>
                      <span className="boss-sites__meta">{member.email}</span>
                      {rowError !== null && rowError.id === member.id && (
                        <span className="boss-members__error" role="alert" data-member-error>
                          {rowError.message}
                        </span>
                      )}
                      {/* 沒有面板的動作（恢復，issue #30）失敗時要有一個地方講；
                          面板自己有位置，所以只在面板沒有開的時候放這裡。 */}
                      {actionError !== null &&
                        actionError.id === member.id &&
                        panel?.id !== member.id && (
                          <span className="boss-members__error" role="alert" data-member-error>
                            {actionError.message}
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
                    <td className="boss-members__actions" data-label={t('boss.members.col.actions')}>
                      <div className="boss-members__buttons">
                        {member.disabledAt === null ? (
                          <>
                            <button
                              type="button"
                              className="boss-link"
                              aria-label={t('boss.members.disableLabel', { name: member.displayName })}
                              disabled={actingId === member.id}
                              onClick={() => {
                                openPanel(member, 'disable');
                              }}
                            >
                              {t('staff.disable')}
                            </button>
                            <button
                              type="button"
                              className="boss-link"
                              aria-label={t('boss.members.resetLabel', { name: member.displayName })}
                              disabled={actingId === member.id}
                              onClick={() => {
                                openPanel(member, 'reset');
                              }}
                            >
                              {t('staff.reset')}
                            </button>
                          </>
                        ) : (
                          /* 停用之後只剩一條路：讓他回來（issue #30）。
                             重設密碼會改一串他用不到的密碼、畫面卻應承「下次
                             登入要改」；改部門也一樣，都是等他回來才有意義的事。 */
                          <button
                            type="button"
                            className="boss-link"
                            aria-label={t('boss.members.enableLabel', { name: member.displayName })}
                            disabled={actingId === member.id}
                            onClick={() => {
                              void handleEnable(member);
                            }}
                          >
                            {t('staff.enable')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* 面板放在同一行的下面，而不是彈窗：彈窗會遮住名單，
                      令人看不到「我正在對邊個做」。 */}
                  {panel !== null && panel.id === member.id && (
                    <tr className="boss-members__panel" data-member-panel={panel.kind}>
                      <td colSpan={5}>
                        {panel.kind === 'disable' ? (
                          <div className="boss-members__panelbody">
                            <p className="boss-field__hint">{t('staff.disable.body')}</p>
                            <div className="boss-form__actions">
                              <button
                                type="button"
                                className="boss-btn boss-btn--primary"
                                disabled={actingId === member.id}
                                onClick={() => {
                                  void handleDisable(member);
                                }}
                              >
                                {t('staff.disable.confirm')}
                              </button>
                              <button
                                type="button"
                                className="boss-btn"
                                onClick={() => {
                                  closePanel();
                                }}
                              >
                                {t('boss.members.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <form
                            className="boss-members__panelbody"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleReset(member);
                            }}
                          >
                            <p className="boss-form__step">
                              {t('staff.reset.title')}
                            </p>

                            <div className="boss-field">
                              <label
                                className="boss-field__label"
                                htmlFor={`member-owner-password-${member.id}`}
                              >
                                {t('staff.reset.ownerPassword')}
                              </label>
                              <input
                                id={`member-owner-password-${member.id}`}
                                className="boss-input"
                                type="password"
                                autoComplete="current-password"
                                value={ownerPassword}
                                onChange={(event) => {
                                  setOwnerPassword(event.target.value);
                                }}
                              />
                            </div>

                            <div className="boss-field">
                              <label
                                className="boss-field__label"
                                htmlFor={`member-temp-password-${member.id}`}
                              >
                                {t('staff.reset.tempPassword')}
                              </label>
                              <input
                                id={`member-temp-password-${member.id}`}
                                className="boss-input"
                                type="password"
                                autoComplete="new-password"
                                value={tempPassword}
                                onChange={(event) => {
                                  setTempPassword(event.target.value);
                                }}
                              />
                              <span className="boss-field__hint">
                                {t('staff.reset.noticeChange')}
                                {t('staff.reset.noticeSession')}
                                {t('staff.reset.noticeMail')}
                              </span>
                            </div>

                            <div className="boss-form__actions">
                              <button
                                type="submit"
                                className="boss-btn boss-btn--primary"
                                disabled={actingId === member.id}
                              >
                                {t('staff.reset.confirm')}
                              </button>
                              <button
                                type="button"
                                className="boss-btn"
                                onClick={() => {
                                  closePanel();
                                }}
                              >
                                {t('boss.members.cancel')}
                              </button>
                            </div>
                          </form>
                        )}

                        {actionError !== null && actionError.id === member.id && (
                          <p className="boss-members__error" role="alert" data-member-error>
                            {actionError.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="boss-sites-card__note">{t('boss.members.footnote')}</p>
        </div>
      )}

      {/* 品牌級編輯權（issue #32）：牌子與人是同一件事的兩面，所以放在同一頁。 */}
      <BrandEditorsPanel staff={state.staff} />
    </>
  );
}
