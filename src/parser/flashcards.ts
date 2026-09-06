// 闪卡解析器:卡片"识别"直接调用 vendor 的原仓库代码(src/lib/parser.ts,即上游 src/parser.ts),
// 保证逐行状态机与原仓库字节级一致;本文件只做三件"外围"事:
//   1) 按上游约定把 frontmatter 空行化后喂给 parse();
//   2) 把上游输出的 (类型, 行区间) 还原为原文行,剥离调度注释,切出前后两面;
//   3) 补本插件需要的牌组来源 / 标题上下文 / 每卡调度注释快照。
// 不在此处引入任何额外解析规则(如全角分隔符、命名空间过滤等)。

import { DUMMY_DUE } from "../core/dates";
import { FlashcardBlock, CardSide, SchedSeg, SRSConfig } from "../core/model";
import { splitFrontmatter, extractTags, matchTagPrefix, tagSubPath } from "./md";
import { parse as upstreamParse, ParserOptions } from "../lib/parser";
import { CardType } from "../lib/compat";

export interface NoteCardParseResult {
    blocks: FlashcardBlock[];
    hasFlashcardTag: boolean;
    noteTagSub: string | null;
}

/** 注释内容 "!2024-01-02,3,250!..." 拆成分段;fsrs 段或非法段 -> null;占位日期视为从未复习 */
export function parseCommentSegments(comment: string): (SchedSeg | null)[] {
    return comment
        .split("!")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => {
            if (s.startsWith("fsrs")) return null;
            const m = s.match(/^(\d{4}-\d{2}-\d{2}),([\d.]+),(\d+)/);
            if (!m) return null;
            const seg: SchedSeg = { due: m[1], interval: Number(m[2]), ease: Number(m[3]) };
            return seg.due === DUMMY_DUE ? null : seg;
        });
}

/** 行是否为独占一行的调度注释(必须从行首开始,与 OSR startsWith("<!--SR:") 一致) */
export function isCommentLine(line: string): boolean {
    return line.startsWith("<!--SR:") && line.includes("-->");
}

const SR_COMMENT_RE = /<!--SR:(.+?)-->/;

/**
 * 适配层预处理:把非 <!--SR: 的 HTML 注释段整体空行化后再交给上游 parse()。
 * (上游 parse() 对跨行 HTML 注释的跳段判断有误——误用首行判断,会吞掉其后全部内容;
 *  原仓库由 Obsidian 侧数据传入时同样受影响。这里在解析前屏蔽,正文保持零改动。)
 */
function maskHtmlComments(lines: string[]): string[] {
    const out = [...lines];
    let i = 0;
    while (i < out.length) {
        const t = out[i];
        if (t.startsWith("<!--") && !t.startsWith("<!--SR:")) {
            out[i] = "";
            if (!t.includes("-->")) {
                while (i + 1 < out.length && !out[i + 1].includes("-->")) {
                    i++;
                    out[i] = "";
                }
                if (i + 1 < out.length) {
                    i++;
                    out[i] = "";
                }
            }
        }
        i++;
    }
    return out;
}

/** 上游默认分隔符(与 OSR DEFAULT_SETTINGS 一致) */
function upstreamOptions(): ParserOptions {
    return {
        singleLineCardSeparator: "::",
        singleLineReversedCardSeparator: ":::",
        multilineCardSeparator: "?",
        multilineReversedCardSeparator: "??",
        multilineCardEndMarker: "",
        // 插件暂不实现挖空卡:传空 pattern,上游 isClozeNote 恒为 false
        clozePatterns: [],
    };
}

/** 把一行的行内调度注释剥离,返回 { 文本, 注释内文 } */
function stripCommentFromLine(rawLine: string): { text: string; inner: string | null } {
    const m = rawLine.match(SR_COMMENT_RE);
    if (!m) return { text: rawLine, inner: null };
    const before = rawLine.slice(0, m.index);
    return { text: before, inner: m[1] };
}

/** 解析整篇笔记,返回闪卡块(deck/上下文/调度快照已补全) */
export function parseFlashcards(
    relPath: string,
    text: string,
    cfg: SRSConfig,
): NoteCardParseResult {
    const allLines = text.split(/\r?\n/);
    const { bodyStart } = splitFrontmatter(text);

    // ---------- ① 识别:调用上游 parse()(frontmatter/HTML注释空行化,行号与原文一致) ----------
    const fmBlanked = allLines.map((l, i) => (i < bodyStart ? "" : l));
    const prepared = maskHtmlComments(fmBlanked);
    const infos = upstreamParse(prepared.join("\n"), upstreamOptions());

    // ---------- ② 上下文(标题栈)与笔记级标签 ----------
    interface Row {
        raw: string;
        g: number;
    }
    const rows: Row[] = [];
    for (let g = bodyStart; g < allLines.length; g++) rows.push({ raw: allLines[g], g });

    const headingStack: { level: number; text: string }[] = [];
    const ctxAt = new Map<number, string[]>();
    const applyHeading = (raw: string, g: number) => {
        const m = raw.match(/^(#{1,6})\s+(.*)$/);
        if (!m) return;
        const level = m[1].length;
        const text = m[2].trim();
        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
            headingStack.pop();
        }
        headingStack.push({ level, text });
        ctxAt.set(g, headingStack.map((h) => `${"#".repeat(h.level)} ${h.text}`));
    };
    for (const r of rows) applyHeading(r.raw, r.g);

    const relDir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
    const baseName = relPath.replace(/\.md$/i, "").split("/").pop() ?? relPath;
    let hasFlashcardTag = false;
    let noteTagSub: string | null = null;
    {
        const { fm } = splitFrontmatter(text);
        const tokens: string[] = [];
        if (fm.has) {
            for (const l of fm.inner.split(/\r?\n/)) {
                if (/^tags\s*:/i.test(l) || /^\s*-\s+/.test(l)) {
                    tokens.push(
                        ...l
                            .replace(/^tags\s*:\s*/i, "")
                            .replace(/^\s*-\s+/, "")
                            .split(/[\s,\[\]"']+/)
                            .filter(Boolean),
                    );
                }
            }
        }
        for (const r of rows) {
            if (/^\s*(```+|~~~+)/.test(r.raw)) continue;
            for (const t of extractTags(r.raw)) tokens.push(t);
        }
        for (const tok of tokens) {
            const withHash = tok.startsWith("#") ? tok : `#${tok}`;
            if (matchTagPrefix(cfg.flashcardTags, withHash)) {
                hasFlashcardTag = true;
                const sub = tagSubPath(cfg.flashcardTags, withHash);
                if (sub !== null && sub !== "" && noteTagSub === null) noteTagSub = sub;
            }
        }
    }

    const resolveDeck = (blockTagSub: string | null): string => {
        const folderDeck = relDir === "" ? baseName : relDir;
        if (cfg.deckSource === "tag") {
            const sub = blockTagSub && blockTagSub !== "" ? blockTagSub : noteTagSub;
            return sub && sub !== "" ? sub : folderDeck;
        }
        if (blockTagSub && blockTagSub !== "") return blockTagSub;
        if (noteTagSub && noteTagSub !== "") return noteTagSub;
        return folderDeck;
    };

    // ---------- ③ 块组装:还原原文行 -> 剥注释 -> 切前后两面 ----------
    const blocks: FlashcardBlock[] = [];
    for (const info of infos) {
        if (info.cardType === CardType.Cloze) continue; // 未开启 pattern,正常不会出现
        const regionLines = allLines.slice(info.firstLineNum, info.lastLineNum + 1);
        const contentLines: string[] = [];
        let commentInner: string | null = null;
        let commentOnNextLine = false;
        for (let k = 0; k < regionLines.length; k++) {
            const rawLine = regionLines[k];
            const stripped = stripCommentFromLine(rawLine);
            if (stripped.inner !== null) {
                if (commentInner === null) commentInner = stripped.inner;
                if (stripped.text.trim() === "") {
                    if (k === regionLines.length - 1) commentOnNextLine = true;
                    continue; // 注释独占该行则整行移除
                }
                contentLines.push(stripped.text.replace(/\s+$/, ""));
                continue;
            }
            contentLines.push(rawLine);
        }

        let sides: CardSide[];
        let blockTagSub: string | null = null;
        let reversed = false;

        if (info.cardType === CardType.SingleLineBasic || info.cardType === CardType.SingleLineReversed) {
            let question = contentLines[0].trim();
            const lead = question.match(/^(#\S+)(\s+)(.*)$/);
            if (lead && matchTagPrefix(cfg.flashcardTags, lead[1])) {
                const sub = tagSubPath(cfg.flashcardTags, lead[1]);
                if (sub !== null) blockTagSub = sub;
                question = lead[3];
            }
            const iRev = question.indexOf(":::");
            if (iRev >= 0 && info.cardType === CardType.SingleLineReversed) {
                const front = question.slice(0, iRev).trim();
                const back = question.slice(iRev + 3).trim();
                reversed = true;
                sides = [
                    { front, back },
                    { front: back, back: front },
                ];
            } else {
                const iB = question.indexOf("::");
                const front = question.slice(0, iB).trim();
                const back = question.slice(iB + 2).trim();
                sides = [{ front, back }];
            }
        } else {
            // 多行:在内容行中找分隔行(先 ?? 后 ?)
            let sepIdx = -1;
            let sepLen = 1;
            for (let k = 0; k < contentLines.length; k++) {
                const t = contentLines[k].trim();
                if (t === "??") {
                    sepIdx = k;
                    sepLen = 2;
                    break;
                }
                if (t === "?") {
                    sepIdx = k;
                    break;
                }
            }
            if (sepIdx < 0) continue;
            const front = contentLines.slice(0, sepIdx).join("\n").trim();
            const back = contentLines.slice(sepIdx + 1).join("\n").trimEnd();
            if (front === "" || back === "") continue; // 空答案退化卡不入队(见 README 差异说明)
            reversed = sepLen === 2;
            sides = reversed
                ? [
                      { front, back },
                      { front: back, back: front },
                  ]
                : [{ front, back }];
        }

        const segsRaw = commentInner ? parseCommentSegments(commentInner) : [];
        const segs: (SchedSeg | null)[] = sides.map((_, k) => segsRaw[k] ?? null);

        blocks.push({
            relPath,
            deck: resolveDeck(blockTagSub),
            deckByTag: blockTagSub !== null || noteTagSub !== null,
            context: ctxAt.get(info.firstLineNum) ?? [],
            reversed,
            sides,
            contentLines,
            commentOnNextLine,
            comment: commentInner,
            segs,
            line: info.firstLineNum,
            endLine: info.lastLineNum,
        });
    }

    // deckSource=tag/tagAndFolder:无闪卡标签的笔记不参与
    const filtered = cfg.deckSource === "folder" ? blocks : blocks.filter(() => hasFlashcardTag);
    return { blocks: filtered, hasFlashcardTag, noteTagSub };
}
