// 稳定序列化 + 轻量哈希：用于回放一致性校验与导出文件的完整性校验。
// 不依赖运行环境（浏览器 / Node 均可），同一输入永远得到同一输出。

/** 键序稳定的 JSON 序列化（对象键排序，数组保持顺序）。 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortValue(src[key]);
    return out;
  }
  return value;
}

/** FNV-1a 32 位哈希，输出 8 位十六进制字符串。 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 任意值的稳定哈希。 */
export function hashValue(value: unknown): string {
  return fnv1a(stableStringify(value));
}
