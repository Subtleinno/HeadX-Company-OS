/**
 * 最小 PNG 解碼／編碼／比對（issue #73 的像素驗收用）。
 *
 * 為什麼自己寫：issue 明令不得新增外部依賴，而驗收要求「比較解碼後像素，
 * 不得以 PNG metadata 或檔案雜湊代替」。Node 內建 zlib 已經有 inflate/deflate，
 * 其餘（chunk 解析、unfilter、CRC）只是幾十行。
 *
 * 只支援本工具會遇到的格式：8-bit、非交錯、colorType 2（RGB）或 6（RGBA）。
 * 遇到其他格式直接報錯，不靜默當成通過。
 */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC32（PNG 每個 chunk 都要）。 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }

  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;

  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }

  return (c ^ 0xffffffff) >>> 0;
}

/** 解碼 PNG，回傳 { width, height, pixels: Uint8Array(RGBA) }。 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('不是 PNG：簽名不符');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8) {
    throw new Error(`只支援 8-bit PNG，實際 ${String(bitDepth)}`);
  }

  if (interlace !== 0) {
    throw new Error('不支援交錯式 PNG');
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;

  if (channels === 0) {
    throw new Error(`不支援的 colorType：${String(colorType)}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  let position = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const current = Uint8Array.from(raw.subarray(position, position + stride));
    position += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;

      switch (filter) {
        case 0:
          break;
        case 1:
          current[x] = (current[x] + left) & 0xff;
          break;
        case 2:
          current[x] = (current[x] + up) & 0xff;
          break;
        case 3:
          current[x] = (current[x] + ((left + up) >> 1)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          current[x] = (current[x] + predictor) & 0xff;
          break;
        }
        default:
          throw new Error(`未知的 PNG filter：${String(filter)}`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = current[source];
      pixels[target + 1] = current[source + 1];
      pixels[target + 2] = current[source + 2];
      pixels[target + 3] = channels === 4 ? current[source + 3] : 255;
    }

    previous.set(current);
  }

  return { width, height, pixels };
}

/** 把 RGBA 像素編成 PNG（filter 0，足夠用於差異圖）。 */
export function encodePng({ width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const chunks = [chunk('IHDR', ihdr(width, height)), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))];

  return Buffer.concat([SIGNATURE, ...chunks]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;

  return data;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

/**
 * 比較兩張圖的解碼後像素。
 * 尺寸不同即失敗（issue 明令）；尺寸相同則數出每一個不同的像素。
 */
export function comparePng(bufferA, bufferB) {
  const a = decodePng(bufferA);
  const b = decodePng(bufferB);

  if (a.width !== b.width || a.height !== b.height) {
    return {
      sameSize: false,
      sizeA: `${String(a.width)}x${String(a.height)}`,
      sizeB: `${String(b.width)}x${String(b.height)}`,
      diffPixels: Number.POSITIVE_INFINITY,
      totalPixels: a.width * a.height,
      ratio: 1,
      diff: null,
    };
  }

  const total = a.width * a.height;
  let diffPixels = 0;
  const diff = new Uint8Array(total * 4);

  for (let index = 0; index < total; index += 1) {
    const at = index * 4;
    const differs =
      a.pixels[at] !== b.pixels[at] ||
      a.pixels[at + 1] !== b.pixels[at + 1] ||
      a.pixels[at + 2] !== b.pixels[at + 2] ||
      a.pixels[at + 3] !== b.pixels[at + 3];

    if (differs) {
      diffPixels += 1;
      // 差異像素標紅，其餘壓成淺灰，方便肉眼定位。
      diff[at] = 255;
      diff[at + 1] = 0;
      diff[at + 2] = 0;
      diff[at + 3] = 255;
    } else {
      const grey = Math.round((a.pixels[at] + a.pixels[at + 1] + a.pixels[at + 2]) / 3);
      const faded = 235 - Math.round((255 - grey) * 0.15);
      diff[at] = faded;
      diff[at + 1] = faded;
      diff[at + 2] = faded;
      diff[at + 3] = 255;
    }
  }

  return {
    sameSize: true,
    sizeA: `${String(a.width)}x${String(a.height)}`,
    sizeB: `${String(b.width)}x${String(b.height)}`,
    diffPixels,
    totalPixels: total,
    ratio: total === 0 ? 0 : diffPixels / total,
    diff: { width: a.width, height: a.height, pixels: diff },
  };
}
