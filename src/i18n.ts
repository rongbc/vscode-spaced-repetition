// 插件显示语言:配置 srs.language(auto / en / zh-cn),默认 auto 跟随 VS Code 界面语言。
// 目前支持英语(en)与简体中文(zh-cn)。运行期字符串一律经 t() 解析,便于扩展更多语言。

import * as vscode from "vscode";

export type Lang = "en" | "zh-cn";

const DICT = {
    // ---- 应用 / 面板 ----
    "app.title": { en: "Flashcard Review", "zh-cn": "闪卡复习" },
    "ui.reveal": { en: "Show answer (Space)", "zh-cn": "显示答案 (空格)" },
    "ui.openNote": { en: "Open note", "zh-cn": "打开笔记" },
    "ui.endReview": { en: "End review", "zh-cn": "结束复习" },
    "ui.close": { en: "Close", "zh-cn": "关闭" },
    "ui.doneTitle": { en: "Review complete 🎉", "zh-cn": "复习完成 🎉" },
    "ui.doneSummary": {
        en: "Total {total} · Again {again} · Hard {hard} · Good {good} · Easy {easy}",
        "zh-cn": "共 {total} 张 · 重来 {again} · 困难 {hard} · 良好 {good} · 简单 {easy}",
    },
    "ui.writeError": {
        en: "⚠ Write-back failed; this review was not recorded",
        "zh-cn": "⚠ 写回失败,本次评级未记录",
    },
    // ---- 评级 ----
    "grade.again": { en: "Again", "zh-cn": "重来" },
    "grade.hard": { en: "Hard", "zh-cn": "困难" },
    "grade.good": { en: "Good", "zh-cn": "良好" },
    "grade.easy": { en: "Easy", "zh-cn": "简单" },
    "grade.againLong": { en: "Again (relearn)", "zh-cn": "再次学习 (重来)" },
    // ---- 卡元信息 ----
    "meta.new": { en: "New card", "zh-cn": "新卡" },
    "meta.last": {
        en: "Last {interval} · ease {ease} · due {due}",
        "zh-cn": "上次间隔 {interval} · 难度 {ease} · 到期 {due}",
    },
    "meta.open": { en: "Open: {relPath}:{line}", "zh-cn": "打开: {relPath}:{line}" },
    // ---- 命令 / 选择器 ----
    "cmd.reviewDue": { en: "Review due flashcards", "zh-cn": "复习到期闪卡" },
    "cmd.reviewAll": { en: "Cram flashcards", "zh-cn": "突击复习闪卡" },
    "cmd.openQueue": { en: "Open due note review queue", "zh-cn": "打开到期笔记复习队列" },
    "cmd.reviewNote": { en: "Review current note", "zh-cn": "复习当前笔记并评级" },
    "cmd.reviewNoteFromTree": { en: "Open and review note", "zh-cn": "打开并复习笔记" },
    // ---- 复习选择器 ---- 
    "pick.allDue": { en: "All due + new cards", "zh-cn": "全部到期 + 新卡" },
    "pick.pending": { en: "{n} items to review", "zh-cn": "共 {n} 项待复习" },
    "pick.deckDue": { en: "Due {due} · New {fresh}", "zh-cn": "到期 {due} · 新 {fresh}" },
    "pick.chooseDeck": { en: "Select a deck to review", "zh-cn": "选择要复习的牌组" },
    "pick.reviewDeck": { en: "Review: {deck}", "zh-cn": "复习: {deck}" },
    "pick.reviewAllDue": { en: "Due flashcard review", "zh-cn": "到期闪卡复习" },
    "pick.allFlashcards": { en: "All flashcards (cram)", "zh-cn": "全部闪卡(突击)" },
    "pick.deckTotal": { en: "{total} cards", "zh-cn": "共 {total} 张" },
    "pick.cramPlaceholder": {
        en: "Cram: ignore the schedule, review anything",
        "zh-cn": "突击复习:忽略调度,任意复习",
    },
    "pick.cramTitle": { en: "Cram flashcards", "zh-cn": "突击复习闪卡" },
    "pick.cramDeck": { en: "Cram: {deck}", "zh-cn": "突击: {deck}" },
    "pick.cramAll": { en: "Cram review", "zh-cn": "突击复习" },
    // ---- 整篇笔记复习 ----
    "note.placeholder": { en: "Review note: {relPath}", "zh-cn": "复习笔记: {relPath}" },
    "note.title": { en: "Whole-note review — how did you do?", "zh-cn": "整篇笔记复习 — 回忆得怎么样?" },
    "note.noTag": {
        en: "This note has no whole-note review tag (e.g. #review) and is not in the note review queue.",
        "zh-cn": "该笔记没有整篇复习标签(如 #review),不参与笔记复习队列。",
    },
    "note.writeFail": {
        en: "Note schedule write-back failed: {relPath} (file may have changed)",
        "zh-cn": "笔记调度写回失败:{relPath}(文件可能正被修改)",
    },
    "note.rated": {
        en: "$(check) {relPath} rated '{grade}'; next {due} ({interval})",
        "zh-cn": "$(check) {relPath} 已评级「{grade}」,下次 {due} ({interval})",
    },
    // ---- 其它消息 ---- 
    "msg.noCards": { en: "No cards due for review 🎉", "zh-cn": "没有可复习的闪卡 🎉" },
    "msg.noWorkspace": { en: "No workspace folder is open", "zh-cn": "未打开工作区" },
    "msg.scanFailed": { en: "Flashcard scan failed: {msg}", "zh-cn": "间隔复习扫描失败:{msg}" },
    "msg.openMdFirst": { en: "Open a Markdown note first", "zh-cn": "请先打开一篇 Markdown 笔记" },
    "msg.openLinkFailed": { en: "Could not open link: {href}", "zh-cn": "无法打开链接:{href}" },
    "msg.openNoteFailed": { en: "Could not open note: {msg}", "zh-cn": "无法打开笔记:{msg}" },
    "msg.writeCardFailed": {
        en: "Schedule write-back failed (file may be editing or content changed): {relPath} — this rating was not recorded.",
        "zh-cn": "调度写回失败(文件可能正被编辑或内容已变):{relPath} — 本次评级未记录。",
    },
    "note.next": { en: "Next {due} ({interval})", "zh-cn": "下次 {due} ({interval})" },
    // ---- 状态栏 ---- 
    "status.name": { en: "Spaced Repetition", "zh-cn": "间隔重复复习" },
    "status.noneText": { en: "$(check) SRS: nothing due", "zh-cn": "$(check) SRS 无到期" },
    "status.noneTooltip": {
        en: "{total} flashcards indexed. Click to review due cards.",
        "zh-cn": "已收录 {total} 张闪卡。点击复习到期闪卡。",
    },
    "status.dueText": {
        en: "$(library) Cards {flashDue} · Notes {noteDue}",
        "zh-cn": "$(library) 闪卡 {flashDue} · 笔记 {noteDue}",
    },
    "status.dueTooltip": {
        en: "{flashDue} due cards, {noteDue} due notes ({total} indexed). Click to start reviewing.",
        "zh-cn": "到期闪卡 {flashDue} 张,到期笔记 {noteDue} 篇(共收录 {total} 张)。点击开始复习。",
    },
    // ---- 侧边栏分组 ----
    "tree.overdue": { en: "Overdue", "zh-cn": "过期" },
    "tree.today": { en: "Today", "zh-cn": "今日" },
    "tree.future": { en: "Future", "zh-cn": "未来" },
    "tree.fresh": { en: "New (unreviewed)", "zh-cn": "新笔记(未复习)" },
    "tree.notScheduled": { en: "Not scheduled", "zh-cn": "未安排" },
} as const;

export type MessageKey = keyof typeof DICT;

/** 解析当前显示语言:配置 srs.language;auto 时跟随 vscode.env.language。 */
export function resolveLang(): Lang {
    const cfg = vscode.workspace.getConfiguration("srs");
    const v = cfg.get<string>("language", "auto");
    if (v === "en") return "en";
    if (v === "zh-cn") return "zh-cn";
    const loc = (vscode.env.language || "en").toLowerCase();
    return loc.startsWith("zh") ? "zh-cn" : "en";
}

/** 取当前语言标签(用于 <html lang=...>)。 */
export function langTag(): Lang {
    return resolveLang();
}

/** 取本地化字符串,可带 {key} 占位替换。 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
    let s: string = DICT[key][resolveLang()];
    if (vars) {
        for (const k of Object.keys(vars)) {
            s = s.split(`{${k}}`).join(String(vars[k]));
        }
    }
    return s;
}
