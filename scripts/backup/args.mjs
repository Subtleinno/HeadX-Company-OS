/**
 * CLI 參數解析與旗標白名單。
 *
 * 為什麼要白名單：每一條指令接受的旗標都不同，而 `parseFlags` 天生會收下任何
 * `--xxx`。打錯一個字（例如把 `--backup-id` 寫成 `--id`）不會報錯，只會被忽略，
 * 然後靜靜地對「最新一份」動手。在災難現場，這種沉默比報錯危險得多。
 */

/** 每條指令接受的旗標。指令名單同時是「有哪些指令」的唯一來源。 */
export const COMMAND_FLAGS = {
  create: ['test-only-root', 'database', 'bucket'],
  verify: ['test-only-root', 'backup-id'],
  list: ['test-only-root'],
  prune: ['test-only-root', 'keep'],
  restore: [
    'test-only-root',
    'backup-id',
    'target-db',
    'target-bucket',
    'create-target-db',
    'purge-bucket',
    'yes',
  ],
  schedule: ['test-only-root'],
  'storage-check': ['test-only-root'],
};

export function parseFlags(args) {
  const flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--')) {
      throw new Error(`無法理解的參數：${arg}`);
    }

    const equals = arg.indexOf('=');

    if (equals !== -1) {
      flags[arg.slice(2, equals)] = arg.slice(equals + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];

    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }

  return flags;
}

export function assertKnownFlags(command, flags) {
  const allowed = COMMAND_FLAGS[command];

  if (allowed === undefined) {
    throw new Error(
      `未知指令：${command}（可用：${Object.keys(COMMAND_FLAGS).join('、')}）`,
    );
  }

  const unknown = Object.keys(flags).filter((name) => !allowed.includes(name));

  if (unknown.length === 0) {
    return;
  }

  const lines = unknown.map((name) => `  --${name}`).join('\n');
  throw new Error(
    `${command} 不接受這些選項：\n${lines}\n可用選項：${allowed.map((name) => `--${name}`).join('、')}`,
  );
}
