import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  StorageObjectNotFoundError,
  type ByteRange,
  type PutOptions,
  type Storage,
  type StoredObject,
  type StoredRange,
} from './index.js';

/**
 * MinIO 實作，走 S3 協定。
 *
 * 版本固定為 RELEASE.2025-10-15T17-29-55Z（與 HxDesign 相同），由 docker/minio/Dockerfile
 * 在本機用官方原始碼建置。這裡只當它是一個 S3 端點，不依賴 MinIO 專屬 API。
 *
 * 選 @aws-sdk/client-s3 的理由見 PR：官方維護、支援 path-style 端點、
 * MinIO 自己的 JS SDK 已進入維護模式。
 */

export type MinioStorageOptions = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
};

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/**
 * /health 探測的逾時。storage 停掉時，socket 可能停在等待狀態很久，
 * 所以 ping 自己帶一個短的 abort 訊號，不依賴 SDK 的預設值。
 */
const PING_TIMEOUT_MS = 2000;

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

async function toBuffer(body: { transformToByteArray: () => Promise<Uint8Array> } | undefined) {
  if (body === undefined) {
    return Buffer.alloc(0);
  }

  return Buffer.from(await body.transformToByteArray());
}

/** 由 `bytes 3-6/10` 取出總長度 10。 */
function totalFromContentRange(contentRange: string | undefined): number | null {
  if (contentRange === undefined) {
    return null;
  }

  const match = /\/(\d+)$/.exec(contentRange.trim());
  return match === null ? null : Number(match[1]);
}

export async function createMinioStorage(options: MinioStorageOptions): Promise<Storage> {
  const { endpoint, accessKey, secretKey, bucket } = options;

  if (accessKey === '' || secretKey === '') {
    // 不把值寫進錯誤訊息，只說哪一個沒設。
    throw new Error('MINIO_ROOT_USER 或 MINIO_ROOT_PASSWORD 未設定，無法連線檔案儲存');
  }

  const client = new S3Client({
    endpoint,
    region: options.region ?? 'us-east-1',
    // MinIO 不支援 virtual-host style（bucket.endpoint），一定要 path style。
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    // 本機 MinIO，重試幫不上忙，只會令 /health 拖到 11 秒以上才回 503。
    // 連不上就即刻失敗，看得見比假裝還在試更重要。
    maxAttempts: 1,
  });

  const ensureBucket = async (): Promise<void> => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      // 兩個 process 同時啟動時，第二個會收到 BucketAlreadyOwnedByYou，視為成功。
      if (isNotFound(error)) {
        return;
      }
      const name = (error as { name?: string }).name;
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
        return;
      }
      throw error;
    }
  };

  await ensureBucket();

  return {
    async put(key: string, body: Buffer | Uint8Array, putOptions?: PutOptions): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: putOptions?.contentType ?? DEFAULT_CONTENT_TYPE,
        }),
      );
    },

    async get(key: string): Promise<StoredObject> {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

        return {
          body: await toBuffer(response.Body as never),
          contentType: response.ContentType ?? DEFAULT_CONTENT_TYPE,
          size: response.ContentLength ?? 0,
        };
      } catch (error) {
        if (isNotFound(error)) {
          throw new StorageObjectNotFoundError(key);
        }
        throw error;
      }
    },

    async getRange(key: string, range: ByteRange): Promise<StoredRange> {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            Range: `bytes=${range.start}-${range.end}`,
          }),
        );

        const total = totalFromContentRange(response.ContentRange);

        return {
          body: await toBuffer(response.Body as never),
          // S3 一定會回 content-range；真的沒有就退回用回傳長度，不假裝知道整個物件多大。
          total: total ?? response.ContentLength ?? 0,
          contentType: response.ContentType ?? DEFAULT_CONTENT_TYPE,
        };
      } catch (error) {
        if (isNotFound(error)) {
          throw new StorageObjectNotFoundError(key);
        }
        throw error;
      }
    },

    async exists(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          return false;
        }
        throw error;
      }
    },

    async remove(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async removePrefix(prefix: string): Promise<number> {
      let removed = 0;
      let token: string | undefined;

      do {
        const listing = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );

        const keys = (listing.Contents ?? [])
          .map((item) => item.Key)
          .filter((key): key is string => key !== undefined);

        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: keys.map((key) => ({ Key: key })) },
            }),
          );
          removed += keys.length;
        }

        token = listing.IsTruncated === true ? listing.NextContinuationToken : undefined;
      } while (token !== undefined);

      return removed;
    },

    async ping(): Promise<void> {
      // 短逾時 + 不重試：/health 要在 3 秒內一定有答案。
      await client.send(new HeadBucketCommand({ Bucket: bucket }), {
        abortSignal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
    },

    async isEmpty(): Promise<boolean> {
      const listing = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      return (listing.KeyCount ?? listing.Contents?.length ?? 0) === 0;
    },
  };
}
