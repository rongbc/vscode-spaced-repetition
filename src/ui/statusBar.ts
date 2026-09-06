// 状态栏:到期闪卡 / 到期笔记计数,点击复习到期闪卡。

import * as vscode from "vscode";

export class StatusBar {
    private item: vscode.StatusBarItem;

    constructor(command: string) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
        this.item.command = command;
        this.item.name = "间隔重复复习";
    }

    update(flashDue: number, noteDue: number, total: number): void {
        if (flashDue + noteDue === 0) {
            this.item.text = `$(check) SRS 无到期`;
            this.item.tooltip = `已收录 ${total} 张闪卡。点击复习到期闪卡。`;
        } else {
            this.item.text = `$(library) 闪卡 ${flashDue} · 笔记 ${noteDue}`;
            this.item.tooltip = `到期闪卡 ${flashDue} 张,到期笔记 ${noteDue} 篇(共收录 ${total} 张)。点击开始复习。`;
        }
        this.item.show();
    }

    dispose(): void {
        this.item.dispose();
    }
}
