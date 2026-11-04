/**
 * CSRF 的第一道：會改變狀態的請求，若帶了 Origin，
 * 它的 host 必須與請求的 Host 相同。
 *
 * 沒帶 Origin 就放行：curl 與伺服器對伺服器不會帶，而瀏覽器對 POST 一定會帶。
 */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || origin === '') {
    return true;
  }

  if (host === undefined || host === '') {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    // 'null'（sandboxed iframe）與任意垃圾都會落在這裡。
    return false;
  }

  if (parsed.host === '') {
    return false;
  }

  return parsed.host.toLowerCase() === host.toLowerCase();
}
