// 到期笔记侧边栏(#review 笔记,按 过期/今日/未来/新 分组)

import * as vscode from "vscode";
import { NoteReviewItem } from "../core/model";
import { todayStr } from "../core/dates";
import { t } from "../i18n";

type GroupId = "overdue" | "today" | "future" | "fresh";

class NoteNode extends vscode.TreeItem {
    constructor(
        public readonly labelText: string,
        public readonly collapsible: vscode.TreeItemCollapsibleState,
        public readonly extra: {
            group?: GroupId;
            relPath?: string;
            due?: string | null;
            desc?: string;
        },
    ) {
        super(labelText, collapsible);
        this.extra = extra;
        if (extra.group) {
            this.contextValue = "group";
        } else {
            this.contextValue = "note";
            this.description = extra.desc;
            this.tooltip = extra.relPath;
            this.command = {
                command: "srs.reviewNoteFromTree",
                title: t("cmd.reviewNoteFromTree"),
                arguments: [extra.relPath],
            };
        }
    }
}

export class NotesTreeProvider implements vscode.TreeDataProvider<NoteNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<NoteNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private items: NoteReviewItem[] = [];

    refresh(items: NoteReviewItem[]): void {
        this.items = items;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: NoteNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: NoteNode): NoteNode[] {
        if (!element) {
            const today = todayStr();
            const groups: { id: GroupId; label: string; list: NoteReviewItem[] }[] = [
                { id: "overdue", label: t("tree.overdue"), list: [] },
                { id: "today", label: t("tree.today"), list: [] },
                { id: "future", label: t("tree.future"), list: [] },
                { id: "fresh", label: t("tree.fresh"), list: [] },
            ];
            for (const it of this.items) {
                let g: GroupId;
                if (it.due === null) g = "fresh";
                else if (it.due < today) g = "overdue";
                else if (it.due === today) g = "today";
                else g = "future";
                groups.find((x) => x.id === g)!.list.push(it);
            }
            const sortByDue = (a: NoteReviewItem, b: NoteReviewItem) =>
                (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99");
            return groups
                .filter((g) => g.list.length > 0)
                .map(
                    (g) =>
                        new NoteNode(`${g.label} (${g.list.length})`, vscode.TreeItemCollapsibleState.Expanded, {
                            group: g.id,
                            desc: "",
                            relPath: undefined,
                            due: undefined,
                        }),
                );
        }
        if (element.extra.group) {
            const gid = element.extra.group;
            const today = todayStr();
            const list = this.items.filter((it) => {
                if (gid === "fresh") return it.due === null;
                if (it.due === null) return false;
                if (gid === "overdue") return it.due < today;
                if (gid === "today") return it.due === today;
                return it.due > today;
            });
            list.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
            return list.map((it) => {
                const name = it.relPath.split("/").pop() ?? it.relPath;
                const folder = it.relPath.includes("/")
                    ? it.relPath.slice(0, it.relPath.lastIndexOf("/"))
                    : "";
                return new NoteNode(name, vscode.TreeItemCollapsibleState.None, {
                    relPath: it.relPath,
                    due: it.due,
                    desc: it.due ? `${it.due} · ${folder}` : folder || t("tree.notScheduled"),
                });
            });
        }
        return [];
    }
}
