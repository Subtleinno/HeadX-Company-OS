// 故意違反：domain 引用 Fastify（domain 必須是純邏輯）。
import 'fastify';

export const logicValue = 'logic';
