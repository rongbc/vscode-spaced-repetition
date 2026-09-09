// 工作区扫描与文件写回(依赖 vscode API;解析本身是纯函数)。

import * as vscode from "vscode";
import { DueBlock, FlashcardBlock, NoteReviewItem, SchedSeg, SRSConfig } from "./core/model";
import { isSegDue, segDueDay } from "./core/scheduler";
import { parseFlashcards } from "./parser/flashcards";
import { makeNoteReviewItem, writeNoteSr } from "./parser/note-review";
import { setCardScheduleText } from "./store/note-writer";

export interface ScanResult {
    entries: { block: FlashcardBlock; ordinal: number }[];
    dueBlocks: DueBlock[]; // 到期 + 新卡(每块每侧一条)
    allBlocks: DueBlock[]; // 突击复习(全部侧)
    notes: NoteReviewItem[];
    decks: { name: string; due: number; fresh: number; total: number }[];
}

/** 归一化相对路径(始终用 '/' 分隔) */
function normRel(uri: vscode.Uri): string {
    const rel = vscode.workspace.asRelativePath(uri, false);
    return rel.split("\\").join("/");
}

/**
 * 读取文档文本:绝不调用 openTextDocument(逐个打开 100+ 篇笔记会让语言服务
 * 逐个解析,是状态栏点击慢到数秒的主因)。策略:
 *   1) 若该文件已真实打开在编辑器/后台(workspace.textDocuments),取缓冲区文本(含未保存修改);
 *   2) 否则直接 workspace.fs.readFile 读盘。
 */
async function textOf(uri: vscode.Uri): Promise<string> {
    const open = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === uri.toString(),
    );
    if (open) return open.getText();
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString("utf8");
}

/** 忽略目录名(内置 + 用户 ignoreGlobs 中以整目录为单位的模式,如 .git、node_modules) */
function ignoredDirNames(cfg: SRSConfig): Set<string> {
    const names = new Set<string>([
        ".git",
        ".obsidian",
        ".vscode",
        ".agents",
        ".trash",
        "node_modules",
        ".github",
    ]);
    for (const g of cfg.ignoreGlobs) {
        // 形如 "**/.git/**"、"**/node_modules/**" 的按目录名忽略
        const m = g.match(/\*\*\/([^/]+)\/\*\*/);
        if (m) names.add(m[1]);
    }
    return names;
}

/** 用 readDirectory 递归收集 markdown 文件(比 findFiles 遍历更可控,且不打开任何文档) */
async function collectMdUris(cfg: SRSConfig): Promise<vscode.Uri[]> {
    const ignoreNames = ignoredDirNames(cfg);
    const roots = vscode.workspace.workspaceFolders ?? [];
    const out: vscode.Uri[] = [];
    const walk = async (dir: vscode.Uri): Promise<void> => {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(dir);
        } catch {
            return;
        }
        for (const [name, type] of entries) {
            if (type === vscode.FileType.Directory) {
                if (ignoreNames.has(name)) continue;
                await walk(vscode.Uri.joinPath(dir, name));
            } else if (name.toLowerCase().endsWith(".md")) {
                out.push(vscode.Uri.joinPath(dir, name));
            }
        }
    };
    for (const root of roots) await walk(root.uri);
    return out;
}

/** 扫描整个工作区,返回牌组/到期/新卡/整篇笔记 */
export async function scanWorkspace(cfg: SRSConfig): Promise<ScanResult> {
    const uris = await collectMdUris(cfg);
    const entries: { block: FlashcardBlock; ordinal: number }[] = [];
    const notes: NoteReviewItem[] = [];

    // 分块并发读取+解析,避免 100+ 次串行远程 IO
    const CHUNK = 8;
    for (let i = 0; i < uris.length; i += CHUNK) {
        const chunk = uris.slice(i, i + CHUNK);
        const results = await Promise.all(
            chunk.map(async (uri) => {
                const relPath = normRel(uri);
                try {
                    const text = await textOf(uri);
                    const parsed = parseFlashcards(relPath, text, cfg);
                    const ni = makeNoteReviewItem(relPath, text, cfg);
                    return { parsed, ni, relPath };
                } catch {
                    return null;
                }
            }),
        );
        for (const r of results) {
            if (!r) continue;
            r.parsed.blocks.forEach((b, ordinal) =>
                entries.push({ block: b, ordinal }),
            );
            if (r.ni) notes.push(r.ni);
        }
    }

    const dueBlocks: DueBlock[] = [];
    const allBlocks: DueBlock[] = [];
    const deckCounts = new Map<string, { due: number; fresh: number; total: number }>();

    for (const e of entries) {
        const b = e.block;
        for (let k = 0; k < b.sides.length; k++) {
            const seg = b.segs[k];
            const isNew = seg === null;
            const isDue = !isNew && isSegDue(seg);
            const item: DueBlock = { block: b, sideIdx: k, isNew, sched: seg, ordinal: e.ordinal };
            allBlocks.push(item);
            if (isNew || isDue) dueBlocks.push(item);
            const c = deckCounts.get(b.deck) ?? { due: 0, fresh: 0, total: 0 };
            c.total++;
            if (isNew) c.fresh++;
            else if (isDue) c.due++;
            deckCounts.set(b.deck, c);
        }
    }
    // 到期在前(按到期日升序),随后新卡
    const byDue = (a: DueBlock, b: DueBlock) => {
        const da = a.sched ? segDueDay(a.sched) : "9999-99-99";
        const db = b.sched ? segDueDay(b.sched) : "9999-99-99";
        if (da !== db) return da < db ? -1 : 1;
        return 0;
    };
    dueBlocks.sort(byDue);

    const decks = [...deckCounts.entries()]
        .map(([name, c]) => ({ name, ...c }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh"));

    return { entries, dueBlocks, allBlocks, notes, decks };
}

/** 读取某文档当前全文(含未保存缓冲) */
export async function readCurrentText(uri: vscode.Uri): Promise<string> {
    return textOf(uri);
}

/** 把整篇笔记 frontmatter sr-* 更新写回 */
export async function writeNoteScheduleToFile(
    uri: vscode.Uri,
    text: string,
    newText: string,
): Promise<boolean> {
    if (text === newText) return true;
    return applyFullTextEdit(uri, text, newText);
}

export async function applyFullTextEdit(
    uri: vscode.Uri,
    oldText: string,
    newText: string,
): Promise<boolean> {
    if (oldText === newText) return true;
    try {
        const openDoc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === uri.toString(),
        );
        if (!openDoc) {
            // 未打开的文件直接落盘,不为此打开文档(避免触发语言服务)
            await vscode.workspace.fs.writeFile(uri, Buffer.from(newText, "utf8"));
            return true;
        }
        const docText = openDoc.getText();
        if (docText !== oldText) {
            // 用户在我方读取后改动过缓冲:放弃整体替换,避免覆盖其编辑
            return false;
        }
        const range = new vscode.Range(
            new vscode.Position(0, 0),
            openDoc.positionAt(docText.length),
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, range, newText);
        const ok = await vscode.workspace.applyEdit(edit);
        // 主动保存,保证调度数据写入磁盘(进度即笔记内容,不落盘则可能丢失)
        if (ok) await openDoc.save();
        return ok;
    } catch {
        return false;
    }
}

/** 闪卡评级写回:relPath+ordinal 定位块,更新其每侧调度 */
export async function writeCardGrade(
    uri: vscode.Uri,
    relPath: string,
    ordinal: number,
    newSegs: (SchedSeg | null)[],
    cfg: SRSConfig,
): Promise<boolean> {
    const text = await textOf(uri);
    const newText = setCardScheduleText(text, cfg, relPath, ordinal, newSegs);
    return applyFullTextEdit(uri, text, newText);
}

/** 整篇笔记评级写回 */
export async function writeNoteGrade(
    uri: vscode.Uri,
    text: string,
    sched: { due: string; interval: number; ease: number },
): Promise<boolean> {
    const newText = writeNoteSr(text, sched);
    return writeNoteScheduleToFile(uri, text, newText);
}
