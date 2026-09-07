// 状态栏:到期闪卡 / 到期笔记计数,点击复习到期闪卡。

import * as vscode from "vscode";
import { t } from "../i18n";

export class StatusBar {
    private item: vscode.StatusBarItem;

    constructor(command: string) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
        this.item.command = command;
        this.item.name = t("status.name");
    }

    update(flashDue: number, noteDue: number, total: number): void {
        if (flashDue + noteDue === 0) {
            this.item.text = t("status.noneText");
            this.item.tooltip = t("status.noneTooltip", { total });
        } else {
            this.item.text = t("status.dueText", { flashDue, noteDue });
            this.item.tooltip = t("status.dueTooltip", { flashDue, noteDue, total });
        }
        this.item.show();
    }

    dispose(): void {
        this.item.dispose();
    }
}
