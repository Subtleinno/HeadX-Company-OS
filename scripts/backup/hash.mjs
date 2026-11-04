import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, stat } from 'node:fs/promises';

/** 備份內每個檔案都用串流算 SHA-256：備份檔可能有幾百 MB，不可以整份讀入記憶體。 */

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function copyWithHash(source, target) {
  await copyFile(source, target);
  const info = await stat(target);

  return { size: info.size, sha256: await sha256File(target) };
}
