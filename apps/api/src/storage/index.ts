import type { ByteRange } from './range.js';

/**
 * Storage 只是一個介面：API 其他部分不應該知道背後是 MinIO 還是別的 S3。
 * 實作在 minio.ts。這張 issue 沒有 HTTP 路由，介面先給之後的上傳／下載路由用。
 */

export type { ByteRange } from './range.js';

export type PutOptions = {
  contentType?: string;
};

export type StoredObject = {
  body: Buffer;
  contentType: string;
  size: number;
};

export type StoredRange = {
  body: Buffer;
  /** 物件總長度，用來組 206 的 content-range。 */
  total: number;
  contentType: string;
};

export interface Storage {
  /** 寫入（覆蓋）一個物件。 */
  put(key: string, body: Buffer | Uint8Array, options?: PutOptions): Promise<void>;

  /** 讀取整個物件；不存在時擲 StorageObjectNotFoundError，不回空內容。 */
  get(key: string): Promise<StoredObject>;

  /** 讀取區段；不存在時擲 StorageObjectNotFoundError。 */
  getRange(key: string, range: ByteRange): Promise<StoredRange>;

  exists(key: string): Promise<boolean>;

  /** 刪除一個物件（已不存在時不報錯）。 */
  remove(key: string): Promise<void>;

  /** 刪除整個前綴下的物件，回傳實際刪除的數量。前綴是原始的 key 前綴，不做路徑邊界推斷。 */
  removePrefix(prefix: string): Promise<number>;

  /** 只確認儲存可用（bucket 讀得到），不讀寫任何物件。給 /health 用。 */
  ping(): Promise<void>;

  /** bucket 是否完全沒有物件。用於分辨「全新安裝、還沒有檔案」與「檔案不見了」。 */
  isEmpty(): Promise<boolean>;
}

export class StorageObjectNotFoundError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`物件不存在：${key}`);
    this.name = 'StorageObjectNotFoundError';
    this.key = key;
  }
}
