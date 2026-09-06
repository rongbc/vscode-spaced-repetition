// Markdown 笔记文本工具:frontmatter 切分、代码围栏识别、标签与标题上下文提取。

export interface FmInfo {
    /** 是否存在 frontmatter */
    has: boolean;
    /** 每个 key 对应在 fm 文本内的整行原文(定位用) */
    keyLines: { key: string; rawLine: string; index: number }[];
    /** fm 原文本(不含首尾 ---),无则空串 */
    inner: string;
    /** fm 起始行号 */
    startLine: number;
    /** fm 结束(--- 之后那一行)行号 */
    endLine: number;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/;

/** 切分 frontmatter,返回 { head(含 fm), body } 与 fm 信息 */
export function splitFrontmatter(text: string): { fm: FmInfo; bodyStart: number } {
    const m = text.match(FM_RE);
    if (!m) {
        return {
            fm: { has: false, keyLines: [], inner: "", startLine: 0, endLine: 0 },
            bodyStart: 0,
        };
    }
    const inner = m[1];
    const keyLines: FmInfo["keyLines"] = [];
    const lines = inner.split(/\r?\n/);
    lines.forEach((rawLine, i) => {
        const km = rawLine.match(/^([A-Za-z0-9_\-]+)\s*:/);
        if (km) keyLines.push({ key: km[1], rawLine, index: i });
    });
    const headLineCount = m[0].split(/\r?\n/).length;
    return {
        fm: { has: true, keyLines, inner, startLine: 0, endLine: headLineCount },
        bodyStart: headLineCount,
    };
}

/** 读取 frontmatter 中某 key 的标量值(字符串),无则 null */
export function fmGet(fm: FmInfo, key: string): string | null {
    const found = fm.keyLines.find((k) => k.key === key);
    if (!found) return null;
    const idx = found.rawLine.indexOf(":");
    let v = found.rawLine.slice(idx + 1).trim();
    v = v.replace(/^["']|["']$/g, "");
    return v === "" ? null : v;
}

/** 在 frontmatter 内设置/删除某 key;missing 为 true 表示该 key 需要新增 */
export function fmSet(
    text: string,
    fm: FmInfo,
    key: string,
    value: string | null,
): string {
    const found = fm.keyLines.find((k) => k.key === key);
    // 定位 "---" 边界:第一行 --- 与 bodyStart 行(结束 --- 行)之间为 fm 区
    const lines = text.split(/\r?\n/);
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    if (!fm.has) {
        if (value === null) return text;
        // 在最顶部插入一个 frontmatter
        const newFm = `---${eol}${key}: ${value}${eol}---${eol}`;
        return newFm + text;
    }
    // fm 区域为第 1 行(---)到第 fm.endLine 行之前
    // keyLines.index 是相对 inner 的行号,实际文本行号 = index + 1
    const lineIdx = found ? found.index + 1 : null;
    if (value === null) {
        if (lineIdx === null) return text;
        lines.splice(lineIdx, 1);
        return lines.join(eol);
    }
    const newLine = `${key}: ${value}`;
    if (lineIdx !== null) {
        lines[lineIdx] = newLine;
        return lines.join(eol);
    }
    // 新增:插到结束 --- 之前
    lines.splice(fm.endLine - 1, 0, newLine);
    return lines.join(eol);
}

/** 按行展开文本,标记每行是否处于代码围栏内 */
export function fenceMask(text: string): boolean[] {
    const lines = text.split(/\r?\n/);
    const mask: boolean[] = new Array(lines.length).fill(false);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*(```+|~~~+)/.test(lines[i])) {
            mask[i] = inFence; // 围栏边界行本身不算内容
            inFence = !inFence;
        } else {
            mask[i] = inFence;
        }
    }
    return mask;
}

/** 从一行文本提取所有 Obsidian 风格标签(#xxx 或 #xxx/yyy,标签内容可含中文),
 *  在空白或常见中英文标点/括号处截断,避免吞掉后面的句子。 */
export function extractTags(line: string): string[] {
    const out: string[] = [];
    // 标签字符:排除空白与 # 及常见标点、括号、引号、代码标记等
    const re = /(?:^|[\s(])(#[^\s#“”"'()（）\[\]【】<>、。，,．.:：;；!！?？*_`|\\]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        out.push(m[1]);
    }
    return out;
}

/** 判断某标签是否命中前缀列表(如 #flashcards/子牌组 命中 #flashcards) */
export function matchTagPrefix(tags: string[], tag: string): boolean {
    for (const p of tags) {
        if (tag === p || tag.startsWith(p + "/")) return true;
    }
    return false;
}

/** 取命中标签后的子路径(不含前缀),如 #flashcards/嵌入式/中断 -> 嵌入式/中断;裸标签 -> "" */
export function tagSubPath(prefixes: string[], tag: string): string | null {
    for (const p of prefixes) {
        if (tag === p) return "";
        if (tag.startsWith(p + "/")) return tag.slice(p.length + 1);
    }
    return null;
}
