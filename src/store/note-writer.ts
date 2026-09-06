// 调度写回(纯文本操作,无 vscode 依赖)。
// 写回约定与 obsidian-spaced-repetition 一致:调度注释写在卡片后一行,
// 注释格式 <!--SR:!到期日,间隔,难度-->;反转/挖空等多卡共享一个注释、每卡一个 !分段,
// 未复习的兄弟卡用占位分段 !2000-01-01,1,<baseEase>。

import { DUMMY_DUE } from "../core/dates";
import { SchedSeg, SRSConfig } from "../core/model";
import { parseFlashcards } from "../parser/flashcards";

/** 依据分段生成注释内文("!seg!seg..."),null 分段用占位 */
export function buildCommentInner(
    segs: (SchedSeg | null)[],
    cfg: SRSConfig,
): string {
    return segs
        .map((s) =>
            s
                ? `!${s.due},${Math.round(s.interval)},${Math.round(s.ease)}`
                : `!${DUMMY_DUE},1,${cfg.baseEase}`,
        )
        .join("");
}

/**
 * 将 ordinal 序号对应的闪卡块更新调度(文本级替换)。
 * @param text    当前笔记全文
 * @param cfg
 * @param relPath 笔记相对路径(重新解析定位块)
 * @param ordinal 该块在 parseFlashcards 结果中的序号(会话内稳定)
 * @param newSegs 每张可答题卡的新调度(与 sides 对齐;全 null 则移除调度注释)
 */
export function setCardScheduleText(
    text: string,
    cfg: SRSConfig,
    relPath: string,
    ordinal: number,
    newSegs: (SchedSeg | null)[],
): string {
    const parsed = parseFlashcards(relPath, text, cfg);
    const block = parsed.blocks[ordinal];
    if (!block) return text;

    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const aligned = block.sides.map((_, k) => newSegs[k] ?? null);
    const hasReal = aligned.some((s) => s !== null);

    // 整段替换:块起始行..结束行(含旧注释行/卡内注释),避免残留旧注释
    const removeCount = block.endLine - block.line + 1;
    let newRegion: string[];
    if (!hasReal) {
        newRegion = [...block.contentLines];
    } else {
        const comment = `<!--SR:${buildCommentInner(aligned, cfg)}-->`;
        newRegion = [...block.contentLines, comment];
    }
    lines.splice(block.line, removeCount, ...newRegion);
    return lines.join(eol);
}
