import { describe, expect, it } from "vitest";
import { buildTimeline, forkTimeline } from "../model/timeline";
import { restoreAt } from "../model/player";
import { exportReplay, importReplay } from "../model/persistence";
import { hashValue } from "../lib/hash";
import { playShift, STANDARD_PLAY } from "./helpers";

function buildPair() {
  const played = playShift({ commands: STANDARD_PLAY, duration: 60 });
  const original = buildTimeline({
    id: "orig",
    name: "原始回放",
    initialBest: 0,
    duration: 60,
    script: played.recorder.script,
  });
  const drill = forkTimeline(original, 22.5);
  drill.command({ type: "lift", id: 3 });
  drill.advanceTo(24.7);
  drill.command({ type: "plate", id: 6 });
  drill.advanceTo(25.0);
  drill.command({ type: "serve" });
  drill.advanceToEnd();
  const forked = drill.finalize();
  return { original, forked };
}

describe("导出 / 导入", () => {
  it("导出再导入能还原相同场面（含分叉时间线）", () => {
    const { original, forked } = buildPair();
    const json = exportReplay([original, forked]);
    const result = importReplay(json);
    expect(result.rejected).toEqual([]);
    expect(result.timelines).toHaveLength(2);

    const reOriginal = result.timelines.find((t) => t.id === "orig")!;
    const reForked = result.timelines.find((t) => t.parentId === "orig")!;
    expect(reOriginal.finalHash).toBe(original.finalHash);
    expect(reOriginal.traceHash).toBe(original.traceHash);
    expect(reForked.finalHash).toBe(forked.finalHash);
    expect(reForked.forkAt).toBe(22.5);

    // 抽样时刻：导入的回放还原出的场面与原回放一致
    for (const t of [0, 13.5, 22.5, 25, 44.4, 60]) {
      expect(restoreAt(reOriginal, t), `原始回放 t=${t}`).toEqual(restoreAt(original, t));
      expect(restoreAt(reForked, t), `演练回放 t=${t}`).toEqual(restoreAt(forked, t));
    }
  });

  it("篡改过的记录被校验和识别", () => {
    const { original } = buildPair();
    const file = JSON.parse(exportReplay([original]));
    file.timelines[0].script[9].t = 20.0; // 偷偷改动起锅时刻
    const result = importReplay(JSON.stringify(file));
    expect(result.timelines).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons.join()).toContain("校验和不符");
  });

  it("内容被替换且重算校验和的记录，会被重模拟识别为不兼容", () => {
    const { original } = buildPair();
    const file = JSON.parse(exportReplay([original]));
    const rec = file.timelines[0];
    rec.eventCount += 1; // 伪造事件数并重算校验和
    const { checksum: _c, ...body } = rec;
    rec.checksum = hashValue(body);
    const result = importReplay(JSON.stringify(file));
    expect(result.timelines).toHaveLength(0);
    expect(result.rejected[0].reasons.join()).toContain("重放结果与记录不符");
  });

  it("识别不兼容的文件：版本过新 / 格式不对 / 不是 JSON", () => {
    const { original } = buildPair();
    const file = JSON.parse(exportReplay([original]));
    file.version = 99;
    expect(() => importReplay(JSON.stringify(file))).toThrow(/v99/);
    file.version = 1;
    file.format = "some-other-replay";
    expect(() => importReplay(JSON.stringify(file))).toThrow(/不是午市厨房/);
    expect(() => importReplay("{oops")).toThrow(/JSON/);
  });

  it("结构残缺的记录逐条拒绝，不影响其他记录导入", () => {
    const { original, forked } = buildPair();
    const file = JSON.parse(exportReplay([original, forked]));
    delete file.timelines[0].script; // 第一条缺脚本
    const result = importReplay(JSON.stringify(file));
    expect(result.timelines).toHaveLength(1);
    expect(result.timelines[0].parentId).toBe("orig");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons.join()).toContain("指令脚本");
  });
});
