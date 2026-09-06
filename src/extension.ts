// 扩展入口:命令注册、工作区扫描、复习/笔记队列装配。

import * as vscode from "vscode";
import { readConfig } from "./config";
import { DueBlock, Grade, SRSConfig } from "./core/model";
import { reviewCardSchedule, newCardSchedule } from "./core/sm2";
import { humanizeInterval, todayStr } from "./core/dates";
import { scanWorkspace, writeNoteGrade, readCurrentText } from "./workspace";
import { ReviewController, ReviewItem, uriOfRel } from "./ui/review";
import { NotesTreeProvider } from "./ui/notesTree";
import { StatusBar } from "./ui/statusBar";
import { noteHasReviewTag, readNoteSr } from "./parser/note-review";

let cfg: SRSConfig = readConfig();

interface CtxBundle {
    controller: ReviewController;
    tree: NotesTreeProvider;
    treeView: vscode.TreeView<unknown>;
    status: StatusBar;
    ctx: vscode.ExtensionContext;
}

function dueBlocksToReviewItems(
    blocks: DueBlock[],
): ReviewItem[] {
    return blocks.map((d) => {
        const side = d.block.sides[d.sideIdx];
        return {
            relPath: d.block.relPath,
            ordinal: d.ordinal,
            sideIdx: d.sideIdx,
            deck: d.block.deck,
            context: [d.block.relPath, ...d.block.context],
            front: side.front,
            back: side.back,
            isNew: d.isNew,
            due: d.sched?.due ?? null,
            segs: [...d.block.segs],
        };
    });
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    cfg = readConfig();
    const tree = new NotesTreeProvider();
    const treeView = vscode.window.createTreeView("srs.dueNotes", {
        treeDataProvider: tree,
    });
    const bundle: CtxBundle = {
        controller: new ReviewController(ctx, cfg),
        tree,
        treeView,
        status: new StatusBar("srs.reviewDueFlashcards"),
        ctx,
    };

    const rescan = async (): Promise<void> => {
        cfg = readConfig();
        try {
            const scan = await scanWorkspace(cfg);
            const flashDue = scan.dueBlocks.filter((d) => !d.isNew).length;
            const fresh = scan.dueBlocks.length - flashDue;
            const noteDue = scan.notes.filter(
                (n) => n.due !== null && n.due <= todayStr(),
            ).length;
            bundle.status.update(flashDue + fresh, noteDue, scan.allBlocks.length);
            bundle.tree.refresh(scan.notes);
            return;
        } catch (e) {
            vscode.window.showWarningMessage(`间隔复习扫描失败:${String(e)}`);
        }
    };

    ctx.subscriptions.push(
        vscode.commands.registerCommand("srs.reviewDueFlashcards", async () => {
            const scan = await scanWorkspace(cfg);
            const picks: vscode.QuickPickItem[] = [
                {
                    label: "全部到期 + 新卡",
                    description: scan.decks
                        .reduce((s, d) => s + d.due + d.fresh, 0)
                        .toString(),
                    detail: `共 ${scan.dueBlocks.length} 项待复习`,
                },
                ...scan.decks
                    .filter((d) => d.due + d.fresh > 0)
                    .map((d) => ({
                        label: d.name,
                        description: `到期 ${d.due} · 新 ${d.fresh}`,
                    })),
            ];
            const chosen = await vscode.window.showQuickPick(picks, {
                placeHolder: "选择要复习的牌组",
                title: "复习到期闪卡",
            });
            if (!chosen) return;
            const deckName = chosen.label === "全部到期 + 新卡" ? null : chosen.label;
            const items = deckName
                ? scan.dueBlocks.filter((d) => d.block.deck === deckName)
                : scan.dueBlocks;
            bundle.controller.start(dueBlocksToReviewItems(items), deckName ? `复习: ${deckName}` : "到期闪卡复习");
            void rescan();
        }),
        vscode.commands.registerCommand("srs.reviewAllFlashcards", async () => {
            const scan = await scanWorkspace(cfg);
            const picks: vscode.QuickPickItem[] = [
                { label: "全部闪卡(突击)", description: String(scan.allBlocks.length) },
                ...scan.decks.map((d) => ({
                    label: d.name,
                    description: `共 ${d.total} 张`,
                })),
            ];
            const chosen = await vscode.window.showQuickPick(picks, {
                placeHolder: "突击复习:忽略调度,任意复习",
                title: "突击复习闪卡",
            });
            if (!chosen) return;
            const deckName = chosen.label === "全部闪卡(突击)" ? null : chosen.label;
            const items = deckName
                ? scan.allBlocks.filter((d) => d.block.deck === deckName)
                : scan.allBlocks;
            bundle.controller.start(dueBlocksToReviewItems(items), deckName ? `突击: ${deckName}` : "突击复习");
        }),
        vscode.commands.registerCommand("srs.openNotesReviewQueue", async () => {
            await vscode.commands.executeCommand("srs.dueNotes.focus");
            void rescan();
        }),
        vscode.commands.registerCommand("srs.reviewNoteFromTree", (relPath?: string) =>
            reviewNoteByRel(bundle, relPath),
        ),
        vscode.commands.registerCommand("srs.reviewCurrentNote", async () => {
            const ed = vscode.window.activeTextEditor;
            if (!ed || ed.document.languageId !== "markdown") {
                vscode.window.showWarningMessage("请先打开一篇 Markdown 笔记");
                return;
            }
            const root = vscode.workspace.workspaceFolders?.[0];
            const relPath = vscode.workspace.asRelativePath(ed.document.uri, false);
            if (!root || relPath.startsWith("..")) return;
            await reviewNoteDoc(bundle, ed.document.uri, relPath, ed.document.getText());
        }),
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.languageId === "markdown") void rescan();
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("srs")) void rescan();
        }),
        { dispose: () => bundle.treeView.dispose() },
    );

    void rescan();
}

/** 从侧边栏某篇笔记发起:打开文档并弹出评级 */
async function reviewNoteByRel(bundle: CtxBundle, relPath?: string): Promise<void> {
    if (!relPath) return;
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) return;
    const uri = uriOfRel(root, relPath);
    const text = await readCurrentText(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    await reviewNoteDoc(bundle, uri, relPath, text);
}

/** 整篇笔记评级:检查 #review 标签 -> 弹评级 QuickPick -> 写回 frontmatter */
async function reviewNoteDoc(
    bundle: CtxBundle,
    uri: vscode.Uri,
    relPath: string,
    text: string,
): Promise<void> {
    if (!noteHasReviewTag(text, cfg)) {
        vscode.window.showInformationMessage(
            `该笔记没有整篇复习标签(如 #review),不参与笔记复习队列。`,
        );
        return;
    }
    const sr = readNoteSr(text);
    const cur = sr.due && sr.interval !== null && sr.ease !== null
        ? { due: sr.due, interval: sr.interval, ease: sr.ease }
        : null;
    const gradeOf = async (): Promise<Grade | null> => {
        const picks: vscode.QuickPickItem[] = (["again", "hard", "good", "easy"] as Grade[]).map(
            (g) => {
                const s = cur ? reviewCardSchedule(g, cur, cfg) : newCardSchedule(g, cfg);
                return {
                    label: gradeLabel(g),
                    description: `下次 ${s.due} (${humanizeInterval(Math.max(0, Math.round(s.interval)))})`,
                };
            },
        );
        const picked = await vscode.window.showQuickPick(picks, {
            placeHolder: `复习笔记: ${relPath}`,
            title: "整篇笔记复习 — 回忆得怎么样?",
        });
        if (!picked) return null;
        const labelToGrade: Record<string, Grade> = {
            "再次学习": "again",
            "困难": "hard",
            "良好": "good",
            "简单": "easy",
        };
        return labelToGrade[picked.label] ?? null;
    };
    const grade = await gradeOf();
    if (grade === null) return;
    const s = cur ? reviewCardSchedule(grade, cur, cfg) : newCardSchedule(grade, cfg);
    const ok = await writeNoteGrade(uri, text, s);
    if (!ok) {
        vscode.window.showWarningMessage(`笔记调度写回失败:${relPath}(文件可能正被修改)`);
        return;
    }
    vscode.window.setStatusBarMessage(
        `$(check) ${relPath} 已评级「${gradeLabel(grade)}」,下次 ${s.due} (${humanizeInterval(s.interval)})`,
        5000,
    );
    void (async () => {
        const scan = await scanWorkspace(cfg);
        bundle.tree.refresh(scan.notes);
        const flashDue = scan.dueBlocks.filter((d) => !d.isNew).length;
        const fresh = scan.dueBlocks.length - flashDue;
        const noteDue = scan.notes.filter((n) => n.due !== null && n.due <= todayStr()).length;
        bundle.status.update(flashDue + fresh, noteDue, scan.allBlocks.length);
    })();
}

function gradeLabel(g: Grade): string {
    switch (g) {
        case "again": return "再次学习 (重来)";
        case "hard": return "困难";
        case "good": return "良好";
        case "easy": return "简单";
    }
}

export function deactivate(): void {
    // 资源随 context.subscriptions 释放
}
