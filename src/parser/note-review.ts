// 整篇笔记复习(#review):标签识别 + frontmatter sr-due / sr-interval / sr-ease 读写。
// 字段与 obsidian-spaced-repetition 的 NoteFile 一致。

import { NoteReviewItem, SRSConfig } from "../core/model";
import { splitFrontmatter, fenceMask, fmGet, fmSet, extractTags, matchTagPrefix } from "./md";

export interface NoteSrSchedule {
    due: string;
    interval: number;
    ease: number;
}

/** 文本是否带整篇复习标签(正文 #review 或 frontmatter tags 中含 review) */
export function noteHasReviewTag(text: string, cfg: SRSConfig): boolean {
    const { fm } = splitFrontmatter(text);
    // frontmatter tags
    if (fm.has) {
        const tagsVal = fmGet(fm, "tags");
        if (tagsVal) {
            const tagRe = /(?:^|[\s,\[\]"'])(#?review)(?:\/[\w-]+)?(?:$|[\s,\[\]"'])/;
            if (tagRe.test(tagsVal)) return true;
        }
    }
    // 正文标签(排除代码围栏)
    const mask = fenceMask(text);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (mask[i]) continue;
        for (const tag of extractTags(lines[i])) {
            if (matchTagPrefix(cfg.noteReviewTags, tag)) return true;
        }
    }
    return false;
}

/** 读取笔记复习调度;无 frontmatter 字段时各字段为 null */
export function readNoteSr(text: string): { due: string | null; interval: number | null; ease: number | null } {
    const { fm } = splitFrontmatter(text);
    const due = fmGet(fm, "sr-due");
    const interval = fmGet(fm, "sr-interval");
    const ease = fmGet(fm, "sr-ease");
    return {
        due,
        interval: interval !== null ? Number(interval) : null,
        ease: ease !== null ? Number(ease) : null,
    };
}

/** 写回笔记复习调度到 frontmatter */
export function writeNoteSr(
    text: string,
    sched: { due: string; interval: number; ease: number },
): string {
    let t = text;
    let { fm } = splitFrontmatter(t);
    t = fmSet(t, fm, "sr-due", sched.due);
    ({ fm } = splitFrontmatter(t));
    t = fmSet(t, fm, "sr-interval", String(Math.round(sched.interval)));
    ({ fm } = splitFrontmatter(t));
    t = fmSet(t, fm, "sr-ease", String(Math.round(sched.ease)));
    return t;
}

/** 从文本构造复习项(供队列用) */
export function makeNoteReviewItem(
    relPath: string,
    text: string,
    cfg: SRSConfig,
): NoteReviewItem | null {
    if (!noteHasReviewTag(text, cfg)) return null;
    const sr = readNoteSr(text);
    return {
        relPath,
        tagged: true,
        due: sr.due,
        interval: sr.interval,
        ease: sr.ease,
    };
}
