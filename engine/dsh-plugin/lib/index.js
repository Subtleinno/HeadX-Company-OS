/**
 * dsh-company-os-panel 的宿主半部。
 *
 * 真正的介面在 lib/client.js（瀏覽器端）。宿主半部只需要存在，
 * 讓 DSH 的載入器有一列可以掛載；它不註冊任何工具，也不改任何行為。
 */
export const name = 'company-os-panel'

/** 不做任何事：這個插件只提供介面，沒有宿主端行為。 */
export function apply() {}
