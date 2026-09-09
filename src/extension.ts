// 扩展入口:命令注册、工作区扫描、复习/笔记队列装配。

import * as vscode from "vscode";
import { readConfig } from "./config";
import { DueBlock, Grade, SRSConfig } from "./core/model";
import { reviewCardSchedule, newCardSchedule } from "./core/sm2";
import { segDueDay } from "./core/scheduler";
import { humanizeInterval, todayStr } from "./core/dates";
import { scanWorkspace, writeNoteGrade, readCurrentText } from "./workspace";
import { ReviewController, ReviewItem, uriOfRel } from "./ui/review";
import { NotesTreeProvider } from "./ui/notesTree";
import { StatusBar } from "./ui/statusBar";
import { noteHasReviewTag, readNoteSr } from "./parser/note-review";
import { t, resolveLang } from "./i18n";

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
            due: d.sched ? segDueDay(d.sched) : null,
            line: d.block.line + 1,
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
            vscode.window.showWarningMessage(t("msg.scanFailed", { msg: String(e) }));
        }
    };

    ctx.subscriptions.push(
        vscode.commands.registerCommand("srs.reviewDueFlashcards", async () => {
            const scan = await scanWorkspace(cfg);
            const allDueLabel = t("pick.allDue");
            const picks: vscode.QuickPickItem[] = [
                {
                    label: allDueLabel,
                    description: scan.decks
                        .reduce((s, d) => s + d.due + d.fresh, 0)
                        .toString(),
                    detail: t("pick.pending", { n: scan.dueBlocks.length }),
                },
                ...scan.decks
                    .filter((d) => d.due + d.fresh > 0)
                    .map((d) => ({
                        label: d.name,
                        description: t("pick.deckDue", { due: d.due, fresh: d.fresh }),
                    })),
            ];
            const chosen = await vscode.window.showQuickPick(picks, {
                placeHolder: t("pick.chooseDeck"),
                title: t("pick.reviewAllDue"),
            });
            if (!chosen) return;
            const deckName = chosen.label === allDueLabel ? null : chosen.label;
            const items = deckName
                ? scan.dueBlocks.filter((d) => d.block.deck === deckName)
                : scan.dueBlocks;
            bundle.controller.start(dueBlocksToReviewItems(items), deckName ? t("pick.reviewDeck", { deck: deckName }) : t("pick.reviewAllDue"));
            void rescan();
        }),
        vscode.commands.registerCommand("srs.reviewAllFlashcards", async () => {
            const scan = await scanWorkspace(cfg);
            const allLabel = t("pick.allFlashcards");
            const picks: vscode.QuickPickItem[] = [
                { label: allLabel, description: String(scan.allBlocks.length) },
                ...scan.decks.map((d) => ({
                    label: d.name,
                    description: t("pick.deckTotal", { total: d.total }),
                })),
            ];
            const chosen = await vscode.window.showQuickPick(picks, {
                placeHolder: t("pick.cramPlaceholder"),
                title: t("pick.cramTitle"),
            });
            if (!chosen) return;
            const deckName = chosen.label === allLabel ? null : chosen.label;
            const items = deckName
                ? scan.allBlocks.filter((d) => d.block.deck === deckName)
                : scan.allBlocks;
            bundle.controller.start(dueBlocksToReviewItems(items), deckName ? t("pick.cramDeck", { deck: deckName }) : t("pick.cramAll"));
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
                vscode.window.showWarningMessage(t("msg.openMdFirst"));
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
        vscode.window.showInformationMessage(t("note.noTag"));
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
                    description: t("note.next", {
                        due: s.due,
                        interval: humanizeInterval(Math.max(0, Math.round(s.interval)), resolveLang()),
                    }),
                };
            },
        );
        const picked = await vscode.window.showQuickPick(picks, {
            placeHolder: t("note.placeholder", { relPath }),
            title: t("note.title"),
        });
        if (!picked) return null;
        const labelToGrade: Record<string, Grade> = {
            [gradeLabel("again")]: "again",
            [gradeLabel("hard")]: "hard",
            [gradeLabel("good")]: "good",
            [gradeLabel("easy")]: "easy",
        };
        return labelToGrade[picked.label] ?? null;
    };
    const grade = await gradeOf();
    if (grade === null) return;
    const s = cur ? reviewCardSchedule(grade, cur, cfg) : newCardSchedule(grade, cfg);
    const ok = await writeNoteGrade(uri, text, s);
    if (!ok) {
        vscode.window.showWarningMessage(t("note.writeFail", { relPath }));
        return;
    }
    vscode.window.setStatusBarMessage(
        t("note.rated", {
            relPath,
            grade: gradeLabel(grade),
            due: s.due,
            interval: humanizeInterval(s.interval, resolveLang()),
        }),
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
        case "again": return t("grade.againLong");
        case "hard": return t("grade.hard");
        case "good": return t("grade.good");
        case "easy": return t("grade.easy");
    }
}

export function deactivate(): void {
    // 资源随 context.subscriptions 释放
}
