import { t } from '@company-os/i18n';

/**
 * 員工登入後的兩道門（issue #14）。
 *
 * 兩種情況都**不套外殼**，理由與 `PermissionGate` 一樣：一個未獲指派部門
 * 的人，不應該在畫面上看到公司裝了幾個 app、每個 app 有哪幾頁。那不是
 * 他的資訊，也不應該用來填滿一個空畫面。
 *
 * 兩種情況分開寫，因為它們是不同的事實：
 *   - 未指派：老闆未放你入任何部門。要找人。
 *   - 未開放：你已經在部門裡，只是那個 app 未做好。等，不用找人。
 * 合併成一句「未能載入」會令第二種人以為自己被漏掉了。
 */

type SignOutProps = {
  onSignOut: () => void;
};

function GatePanel(props: {
  title: string;
  body: string;
  onSignOut: () => void;
  testId: string;
}) {
  return (
    <main className="gate" data-gate={props.testId}>
      <div className="gate__panel">
        <h1 className="gate__title">{props.title}</h1>
        <p className="gate__body">{props.body}</p>
        <button type="button" className="gate__back" onClick={props.onSignOut}>
          {t('gate.signOut')}
        </button>
      </div>
    </main>
  );
}

/** 員工冇部門。 */
export function NoDepartmentGate({ onSignOut }: SignOutProps) {
  return (
    <GatePanel
      testId="no-department"
      title={t('gate.noDepartment.title')}
      body={t('gate.noDepartment.body')}
      onSignOut={onSignOut}
    />
  );
}

/** 有部門，但該部門的 app 未開放。`department` 用 manifest 的 title。 */
export function DepartmentClosedGate({ department, onSignOut }: SignOutProps & { department: string }) {
  return (
    <GatePanel
      testId="department-closed"
      title={t('gate.departmentClosed.title')}
      body={t('gate.departmentClosed.body', { department })}
      onSignOut={onSignOut}
    />
  );
}
