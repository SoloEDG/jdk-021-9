import { hashValue } from "../lib/hash";
import type { TimedCommand } from "./events";
import { buildTimeline, type Timeline } from "./timeline";

/**
 * 回放记录的导出 / 导入。
 *
 * 导出文件带格式名、版本号与逐条校验和；导入时：
 * - 文件级：格式不符或版本不兼容直接报错；
 * - 记录级：校验和损坏、或按脚本重模拟后与记录的事件流/终点指纹
 *   不一致（通常意味着游戏规则版本不兼容），该条记录会被识别为
 *   不兼容并列入 rejected，其余记录正常还原。
 */

export const REPLAY_FORMAT = "lunch-rush-replay";
export const REPLAY_VERSION = 1;

interface SerializedTimeline {
  id: string;
  name: string;
  parentId: string | null;
  forkAt: number | null;
  initialBest: number;
  duration: number;
  script: TimedCommand[];
  eventCount: number;
  traceHash: string;
  finalHash: string;
  checksum: string;
}

interface ReplayFile {
  format: string;
  version: number;
  exportedAt: string;
  timelines: SerializedTimeline[];
}

export interface RejectedRecord {
  id: string;
  name: string;
  reasons: string[];
}

export interface ImportResult {
  timelines: Timeline[];
  rejected: RejectedRecord[];
}

function serializeTimeline(t: Timeline): SerializedTimeline {
  const body = {
    id: t.id,
    name: t.name,
    parentId: t.parentId,
    forkAt: t.forkAt,
    initialBest: t.initialBest,
    duration: t.duration,
    script: t.script,
    eventCount: t.events.length,
    traceHash: t.traceHash,
    finalHash: t.finalHash,
  };
  return { ...body, checksum: hashValue(body) };
}

/** 把时间线导出为 JSON 文本。 */
export function exportReplay(timelines: Timeline[]): string {
  const file: ReplayFile = {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    exportedAt: new Date().toISOString(),
    timelines: timelines.map(serializeTimeline),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * 导入回放文件。文件级问题（不是 JSON、格式不符、版本过新）会抛出
 * 带中文说明的 Error；记录级问题进入返回值的 rejected 列表。
 */
export function importReplay(json: string): ImportResult {
  let file: ReplayFile;
  try {
    file = JSON.parse(json) as ReplayFile;
  } catch {
    throw new Error("导入失败：文件不是有效的 JSON");
  }
  if (!file || typeof file !== "object" || file.format !== REPLAY_FORMAT) {
    throw new Error("导入失败：这不是午市厨房的回放文件");
  }
  if (typeof file.version !== "number" || file.version < 1) {
    throw new Error("导入失败：回放文件缺少有效的版本号");
  }
  if (file.version > REPLAY_VERSION) {
    throw new Error(
      `导入失败：回放文件版本 v${file.version} 高于当前支持的 v${REPLAY_VERSION}，请升级游戏`,
    );
  }
  if (!Array.isArray(file.timelines)) {
    throw new Error("导入失败：回放文件缺少时间线记录");
  }

  const timelines: Timeline[] = [];
  const rejected: RejectedRecord[] = [];
  for (const raw of file.timelines) {
    const reasons = validateRecord(raw);
    if (reasons.length) {
      rejected.push({ id: String(raw?.id ?? "?"), name: String(raw?.name ?? "未命名"), reasons });
      continue;
    }
    const rec = raw as SerializedTimeline;
    // 重模拟验证：只有能还原出相同场面的记录才被接受。
    const rebuilt = buildTimeline({
      id: rec.id,
      name: rec.name,
      parentId: rec.parentId,
      forkAt: rec.forkAt,
      initialBest: rec.initialBest,
      duration: rec.duration,
      script: rec.script,
    });
    const mismatches: string[] = [];
    if (rebuilt.events.length !== rec.eventCount) {
      mismatches.push(`事件数 ${rec.eventCount} → ${rebuilt.events.length}`);
    }
    if (rebuilt.traceHash !== rec.traceHash) mismatches.push("事件流指纹不一致");
    if (rebuilt.finalHash !== rec.finalHash) mismatches.push("终局状态指纹不一致");
    if (mismatches.length) {
      rejected.push({
        id: rec.id,
        name: rec.name,
        reasons: [
          `重放结果与记录不符（${mismatches.join("、")}），可能是游戏规则版本不兼容`,
        ],
      });
      continue;
    }
    timelines.push(rebuilt);
  }
  return { timelines, rejected };
}

function validateRecord(raw: unknown): string[] {
  const reasons: string[] = [];
  if (!raw || typeof raw !== "object") return ["记录不是有效的对象"];
  const rec = raw as Partial<SerializedTimeline>;
  if (typeof rec.id !== "string" || !rec.id) reasons.push("缺少 id");
  if (typeof rec.name !== "string") reasons.push("缺少名称");
  if (typeof rec.initialBest !== "number") reasons.push("缺少开局最佳成绩");
  if (typeof rec.duration !== "number" || rec.duration <= 0) reasons.push("时长无效");
  if (!Array.isArray(rec.script)) reasons.push("缺少指令脚本");
  else {
    for (const c of rec.script) {
      if (
        typeof c?.t !== "number" ||
        typeof c?.seq !== "number" ||
        !c?.cmd ||
        typeof c.cmd.type !== "string"
      ) {
        reasons.push("指令脚本包含无效条目");
        break;
      }
    }
  }
  if (typeof rec.eventCount !== "number" || rec.eventCount < 0) reasons.push("事件数无效");
  if (typeof rec.traceHash !== "string") reasons.push("缺少事件流指纹");
  if (typeof rec.finalHash !== "string") reasons.push("缺少终局指纹");
  if (typeof rec.checksum !== "string") {
    reasons.push("缺少校验和");
  } else if (reasons.length === 0) {
    const { checksum: _checksum, ...body } = rec;
    if (hashValue(body) !== rec.checksum) reasons.push("校验和不符，记录可能已被篡改");
  }
  return reasons;
}
