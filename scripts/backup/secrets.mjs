/**
 * 備份內的密碼檔（config/env.backup）權限檢查。
 *
 * 建立備份時會把 .env 複製進去，裡面有資料庫與 MinIO 的密碼。我們會要求 0600，
 * 但這個要求只在 POSIX 檔案系統生效：Windows 上 Node 的 mode 參數會被忽略，
 * 檔案一律變成所有人可讀。
 *
 * 無聲地失敗比失敗更危險：操作者會以為備份碟上的密碼有保護。所以這裡負責把
 * 「實際拿到的權限」變成一句人看得懂的警告。
 */
export function secretFileWarning(mode) {
  if (typeof mode !== 'number' || !Number.isFinite(mode)) {
    return {
      permissions: 'unknown',
      message: '無法讀取備份內 env.backup 的檔案權限；請自行確認備份碟只有授權帳戶可讀。',
    };
  }

  const permissions = mode & 0o777;

  // 只有擁有者可以讀寫（或更嚴）：理想情況。
  if ((permissions & 0o077) === 0) {
    return null;
  }

  const octal = permissions.toString(8).padStart(3, '0');
  const windows = (permissions & 0o666) === 0o666;

  return {
    permissions: octal,
    message: windows
      ? `備份內的 config/env.backup 有密碼，但這個檔案系統不支援 POSIX 權限（Windows 會忽略 0600，實際是 ${octal}）。請靠磁碟加密（BitLocker）與 Windows 帳戶權限保護備份碟。`
      : `備份內的 config/env.backup 有密碼，實際權限是 ${octal}（要求 600）。請收緊權限或改用加密磁碟。`,
  };
}
