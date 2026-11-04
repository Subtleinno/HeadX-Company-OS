import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 結構化記錄：每件事一行 JSON，寫入 <backup root>/company-os/logs/backup.log，同時可印給人看。
 *
 * 為什麼不只寫審計表：資料庫本身可能是壞掉的那一半。備份失敗時，
 * 紀錄一定要留在碟上，這是唯一還讀得到的地方。
 */
export function createLogger({ root, logDir, echo = () => undefined }) {
  const directory = logDir ?? join(root, 'company-os', 'logs');
  let ready = null;

  const writeLine = async (line) => {
    ready ??= mkdir(directory, { recursive: true });
    await ready;
    await appendFile(join(directory, 'backup.log'), `${line}\n`, 'utf8');
  };

  return {
    /** 機器讀的事件。寫檔失敗不應該令備份失敗，但要印出來。 */
    event(entry) {
      const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
      writeLine(line).catch((error) => {
        echo(`（記錄寫入失敗：${error instanceof Error ? error.message : String(error)}）`);
      });
    },

    /** 給人看的一行。 */
    say(text) {
      echo(text);
    },
  };
}

export function createConsoleLogger({ root, logDir } = {}) {
  return createLogger({
    root,
    logDir,
    echo: (text) => process.stdout.write(`${text}\n`),
  });
}
