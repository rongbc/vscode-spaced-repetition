// 闪卡复习会话:队列管理 + Webview 面板。
// 扩展端持有队列并计算新调度 -> 写回笔记 -> 推进;Webview 只展示与收集评级。

import * as vscode from "vscode";
import { Grade, SchedSeg, SRSConfig } from "../core/model";
import { calcNextSeg, humanizeSegInterval, segDueDay, segEaseDisplay } from "../core/scheduler";
import {
    renderFullMd,
    readHljsThemeCss,
    readKatexCss,
    MdThemeKind,
} from "./markdown";
import { writeCardGrade } from "../workspace";
import { t, langTag } from "../i18n";

function themeKind(): MdThemeKind {
    const k = vscode.window.activeColorTheme.kind;
    return k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast
        ? "dark"
        : "light";
}

function noteDirOf(relPath: string): string {
    const i = relPath.lastIndexOf("/");
    return i >= 0 ? relPath.slice(0, i) : "";
}

export interface ReviewItem {
    relPath: string;
    ordinal: number;
    sideIdx: number;
    deck: string;
    context: string[];
    front: string;
    back: string;
    isNew: boolean;
    due: string | null;
    line: number; // 卡片起始行(1 基,用于「路径:行号」与跳转)
    segs: (SchedSeg | null)[];
}

export interface GradeCounts {
    again: number;
    hard: number;
    good: number;
    easy: number;
}

export function uriOfRel(root: vscode.WorkspaceFolder | undefined, relPath: string): vscode.Uri {
    if (!root) throw new Error(t("msg.noWorkspace"));
    return vscode.Uri.joinPath(root.uri, ...relPath.split("/"));
}

export class ReviewController {
    private panel: vscode.WebviewPanel | null = null;
    private items: ReviewItem[] = [];
    private idx = 0;
    private counts: GradeCounts = { again: 0, hard: 0, good: 0, easy: 0 };
    private cfg: SRSConfig;
    private ctx: vscode.ExtensionContext;
    private root: vscode.WorkspaceFolder | undefined;
    private revealed = false;

    constructor(ctx: vscode.ExtensionContext, cfg: SRSConfig) {
        this.ctx = ctx;
        this.cfg = cfg;
        this.root = vscode.workspace.workspaceFolders?.[0];
        // 深/浅色主题切换时只换 hljs 主题 CSS(Webview 的 <style id="themeCss">),
        // 无需重建整个面板,避免丢失当前卡片与展开状态。
        vscode.window.onDidChangeActiveColorTheme(
            () => {
                if (this.panel) this.post({ type: "theme", css: readHljsThemeCss(themeKind()) });
            },
            undefined,
            this.ctx.subscriptions,
        );
    }

    get active(): boolean {
        return this.panel !== null;
    }

    start(items: ReviewItem[], title: string): void {
        if (items.length === 0) {
            vscode.window.showInformationMessage(t("msg.noCards"));
            return;
        }
        this.items = items;
        this.idx = 0;
        this.counts = { again: 0, hard: 0, good: 0, easy: 0 };
        this.ensurePanel(title);
        this.panel?.reveal();
        this.sendCurrent();
    }

    private ensurePanel(title: string): void {
        if (this.panel) {
            this.panel.title = title;
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            "srs.review",
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                // 允许卡片内的本地图片通过 asWebviewUri 加载
                localResourceRoots: this.root ? [this.root.uri] : undefined,
            },
        );
        this.panel = panel;
        const katexCss = readKatexCss();
        panel.webview.html = buildShellHtml(readHljsThemeCss(themeKind()), katexCss);
        panel.webview.onDidReceiveMessage(
            (msg) => void this.onMessage(msg),
            undefined,
            this.ctx.subscriptions,
        );
        panel.onDidDispose(
            () => {
                this.panel = null;
            },
            undefined,
            this.ctx.subscriptions,
        );
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case "reveal":
                this.revealed = true;
                this.post({ type: "revealed" });
                return;
            case "grade":
                await this.handleGrade(msg.grade as Grade);
                return;
            case "open":
                await this.openNote();
                return;
            case "mdLink":
                await this.handleMdLink(msg.href as string);
                return;
            case "close":
                this.panel?.dispose();
                return;
        }
    }

    private async handleMdLink(href: string): Promise<void> {
        const item = this.items[this.idx];
        const dir = item ? noteDirOf(item.relPath) : "";
        try {
            if (/^https?:|^mailto:/i.test(href)) {
                await vscode.env.openExternal(vscode.Uri.parse(href));
                return;
            }
            const clean = href.split(/[?#]/)[0];
            if (clean === "") return;
            // 其余按本地文件处理:绝对路径相对工作区根,相对路径相对当前笔记目录
            const uri = clean.startsWith("/")
                ? this.root
                    ? vscode.Uri.joinPath(this.root.uri, clean.replace(/^\/+/, ""))
                    : undefined
                : this.root
                    ? vscode.Uri.joinPath(dir === "" ? this.root.uri : uriOfRel(this.root, dir), clean)
                    : undefined;
            if (!uri) return;
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        } catch {
            vscode.window.showWarningMessage(t("msg.openLinkFailed", { href }));
        }
    }

    private async openNote(): Promise<void> {
        const item = this.items[this.idx];
        if (!item) return;
        try {
            const uri = uriOfRel(this.root, item.relPath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            if (item.line > 0) {
                const pos = new vscode.Position(item.line - 1, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
        } catch (e) {
            vscode.window.showWarningMessage(t("msg.openNoteFailed", { msg: String(e) }));
        }
    }

    private async handleGrade(grade: Grade): Promise<void> {
        if (!this.revealed) {
            this.post({ type: "needReveal" });
            return;
        }
        const item = this.items[this.idx];
        if (!item) return;

        const curSeg = item.segs[item.sideIdx] ?? null;
        const next = calcNextSeg(grade, curSeg, this.cfg);

        const segs = [...item.segs];
        segs[item.sideIdx] = next;

        let ok = false;
        try {
            const uri = uriOfRel(this.root, item.relPath);
            ok = await writeCardGrade(uri, item.relPath, item.ordinal, segs, this.cfg);
        } catch {
            ok = false;
        }
        if (!ok) {
            this.post({ type: "writeError", text: t("ui.writeError") });
            vscode.window.showWarningMessage(t("msg.writeCardFailed", { relPath: item.relPath }));
            return;
        }

        this.counts[grade]++;
        item.segs = segs;
        item.isNew = false;
        item.due = segDueDay(next);
        this.revealed = false;
        this.idx++;
        this.sendCurrent();
    }

    private sendCurrent(): void {
        if (!this.panel) return;
        const item = this.items[this.idx];
        if (!item) {
            this.post({
                type: "done",
                counts: this.counts,
                total: this.items.length,
                doneTitle: t("ui.doneTitle"),
                summary: t("ui.doneSummary", {
                    total: this.items.length,
                    again: this.counts.again,
                    hard: this.counts.hard,
                    good: this.counts.good,
                    easy: this.counts.easy,
                }),
                close: t("ui.close"),
            });
            return;
        }
        const curSeg = item.segs[item.sideIdx] ?? null;
        const ivls = (["again", "hard", "good", "easy"] as Grade[]).map((g) =>
            humanizeSegInterval(calcNextSeg(g, curSeg, this.cfg), langTag()),
        );
        // 本地图片:相对当前笔记目录解析 -> webview URI;解析失败保留原样
        const dir = item.relPath.includes("/") ? item.relPath.slice(0, item.relPath.lastIndexOf("/")) : "";
        const webview = this.panel!.webview;
        const imgSrc =
            this.root === undefined
                ? undefined
                : (src: string) => {
                      try {
                          const clean = src.split(/[?#]/)[0];
                          const base = dir === "" ? this.root!.uri : uriOfRel(this.root!, dir);
                          return webview.asWebviewUri(vscode.Uri.joinPath(base, clean)).toString();
                      } catch {
                          return null;
                      }
                  };
        const metaText = item.isNew
            ? t("meta.new")
            : curSeg
                ? t("meta.last", {
                      interval: humanizeSegInterval(curSeg, langTag()),
                      ease: segEaseDisplay(curSeg),
                      due: segDueDay(curSeg),
                  })
                : "";
        this.post({
            type: "card",
            idx: this.idx,
            total: this.items.length,
            deck: item.deck,
            context: item.context,
            relPath: item.relPath,
            frontHtml: renderFullMd(item.front, imgSrc),
            backHtml: renderFullMd(item.back, imgSrc),
            isNew: item.isNew,
            due: item.due,
            before: curSeg
                ? {
                      interval: humanizeSegInterval(curSeg, langTag()),
                      ease: segEaseDisplay(curSeg),
                      due: segDueDay(curSeg),
                  }
                : null,
            ivls,
            metaText,
            openLabel: t("meta.open", { relPath: item.relPath, line: item.line }),
        });
    }

    private post(data: unknown): void {
        if (this.panel) void this.panel.webview.postMessage(data);
    }
}

function buildShellHtml(hljsCss: string, katexCss: string): string {
    const nonce = Math.random().toString(36).slice(2);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: data: vscode-webview-resource:;`;
    return `<!DOCTYPE html>
<html lang="${langTag()}">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${t("app.title")}</title>
<style id="themeCss">${hljsCss}</style>
<style>${katexCss}</style>
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 14px 18px; }
.hd { margin-bottom: 10px; }
.hd .top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.deck { font-weight:600; }
.prog { color: var(--vscode-descriptionForeground); }
.ctx { color: var(--vscode-descriptionForeground); font-size:12px; margin-top:2px; }
.card { border:1px solid var(--vscode-panel-border); border-radius:8px; padding:16px 18px; }
/* ---- Markdown 内容(.md)排版,对齐 VS Code Markdown 预览观感 ---- */
.md { word-wrap:break-word; }
.md h1,.md h2,.md h3,.md h4,.md h5,.md h6 { font-weight:600; line-height:1.3; margin:.55em 0 .25em; }
.md h1 { font-size:1.45em; } .md h2 { font-size:1.3em; } .md h3 { font-size:1.15em; }
.md h4,.md h5,.md h6 { font-size:1.05em; }
.md p { margin:.35em 0; }
.md ul,.md ol { margin:.35em 0; padding-left:1.7em; }
.md li { margin:.12em 0; }
.md blockquote { margin:.45em 0; padding:.15em .9em; border-left:3px solid var(--vscode-textBlockQuote-border); background:var(--vscode-textBlockQuote-background); color:var(--vscode-descriptionForeground); }
.md hr { border:none; border-top:1px solid var(--vscode-panel-border); margin:.9em 0; }
.md img { max-width:100%; border-radius:4px; }
.md a { color: var(--vscode-textLink-foreground); text-decoration:none; }
.md a:hover { text-decoration:underline; }
.md table { border-collapse:collapse; margin:.5em 0; display:block; max-width:100%; overflow-x:auto; font-size:.95em; }
.md th,.md td { border:1px solid var(--vscode-panel-border); padding:3px 10px; }
.md th { background: var(--vscode-textBlockQuote-background); font-weight:600; }
/* 行内代码:仅非 <pre> 内的 code 打底色,避免给高亮代码块再叠一层 */
.md code:not(pre code) { font-family:var(--vscode-editor-font-family); background:var(--vscode-textCodeBlock-background); padding:1px 4px; border-radius:3px; font-size:.92em; }
.md pre { background: var(--vscode-textCodeBlock-background); padding:8px 10px; border-radius:6px; overflow:auto; font-size:12.5px; line-height:1.45; }
/* hljs 主题自带的背景覆盖为 VSCode 变量,文字色/令牌色仍由主题 CSS 决定 */
.md pre.hljs { background: var(--vscode-textCodeBlock-background); }
.md pre code { background:transparent; padding:0; font-family:var(--vscode-editor-font-family); }
.back { display:none; border-top:1px dashed var(--vscode-panel-border); margin-top:12px; padding-top:12px; }
.btns { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
button { color: var(--vscode-foreground); }
.btns button { flex:1; min-width:100px; padding:7px 4px; border-radius:6px; border:1px solid var(--vscode-panel-border); background:transparent; color:var(--vscode-foreground); cursor:pointer; }
.btns button:hover { background: var(--vscode-button-hoverBackground); color: var(--vscode-button-foreground); }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color:transparent; }
button.primary:hover { background: var(--vscode-button-hoverBackground); }
.grades button .ivl { display:block; font-size:11px; opacity:.75; }
.meta { margin-top:12px; font-size:12px; color: var(--vscode-descriptionForeground); }
a { color: var(--vscode-textLink-foreground); cursor:pointer; text-decoration:none; }
.center { text-align:center; margin-top:32px; }
.center h2 { margin:.4em 0; }
</style>
</head>
<body>
<div class="hd">
  <div class="top"><span class="deck" id="deck">—</span><span class="prog" id="prog"></span></div>
  <div class="ctx" id="ctx"></div>
</div>
<div class="card">
  <div class="front md" id="front"></div>
  <div class="back md" id="back"></div>
  <div class="btns" id="revealRow">
    <button class="primary" id="reveal">${t("ui.reveal")}</button>
  </div>
  <div class="btns grades" id="grades" style="display:none">
    <button id="again-btn-el"><span id="lbl-again">${t("grade.again")}</span><span class="ivl" id="ivl-again"></span></button>
    <button id="hard-btn-el"><span id="lbl-hard">${t("grade.hard")}</span><span class="ivl" id="ivl-hard"></span></button>
    <button id="good-btn-el"><span id="lbl-good">${t("grade.good")}</span><span class="ivl" id="ivl-good"></span></button>
    <button id="easy-btn-el"><span id="lbl-easy">${t("grade.easy")}</span><span class="ivl" id="ivl-easy"></span></button>
  </div>
  <div class="meta">
    <a id="openNote">${t("ui.openNote")}</a> · <a id="closeBtn">${t("ui.endReview")}</a>
    <div id="meta"></div>
  </div>
</div>
<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  let revealed = false;
  const $ = (id) => document.getElementById(id);
  function showAnswer(){
    if (revealed) return;
    revealed = true;
    // 必须显式覆盖样式表 .back{display:none},赋空字符串会退回 none 导致答案区一直隐藏
    $('back').style.display = 'block';
    $('revealRow').style.display = 'none';
    $('grades').style.display = 'flex';
  }
  function grade(g){ vscode.postMessage({type:'grade', grade:g}); }
  function showCard(d){
    revealed = false;
    $('deck').textContent = d.deck;
    $('prog').textContent = (d.idx+1) + ' / ' + d.total;
    $('ctx').textContent = (d.context && d.context.length ? d.context.join(' › ') : '') ;
    $('front').innerHTML = d.frontHtml;
    $('back').innerHTML = d.backHtml;
    $('back').style.display = 'none';
    $('revealRow').style.display = 'flex';
    $('grades').style.display = 'none';
    $('ivl-again').textContent = d.ivls[0];
    $('ivl-hard').textContent = d.ivls[1];
    $('ivl-good').textContent = d.ivls[2];
    $('ivl-easy').textContent = d.ivls[3];
    $('meta').textContent = d.metaText;
    $('openNote').textContent = d.openLabel;
  }
  function showDone(d){
    document.querySelector('.card').innerHTML =
      '<div class="center"><h2>' + d.doneTitle + '</h2>' +
      '<p>' + d.summary + '</p>' +
      '<p><button class="primary" id="close-done">' + d.close + '</button></p></div>';
    $('close-done').onclick = ()=> vscode.postMessage({type:'close'});
  }
  window.addEventListener('message', (e)=>{
    const m = e.data;
    if (!m) return;
    if (m.type==='card') showCard(m);
    else if (m.type==='done') showDone(m);
    else if (m.type==='needReveal') showAnswer();
    else if (m.type==='revealed') showAnswer();
    else if (m.type==='writeError') $('meta').textContent = m.text;
    else if (m.type==='theme') { const el = $('themeCss'); if (el) el.textContent = m.css; }
  });
  // Markdown 内链接:拦截后交给扩展端(外链 openExternal / 本地文件打开)
  function onMdClick(ev){
    const t = ev.target;
    const a = t && t.closest ? t.closest('a[href]') : null;
    if (!a) return;
    ev.preventDefault();
    vscode.postMessage({type:'mdLink', href: a.getAttribute('href')});
  }
  $('front').addEventListener('click', onMdClick);
  $('back').addEventListener('click', onMdClick);
  $('reveal').onclick = ()=> vscode.postMessage({type:'reveal'});
  $('again-btn-el').onclick = ()=> grade('again');
  $('hard-btn-el').onclick = ()=> grade('hard');
  $('good-btn-el').onclick = ()=> grade('good');
  $('easy-btn-el').onclick = ()=> grade('easy');
  $('openNote').onclick = ()=> vscode.postMessage({type:'open'});
  $('closeBtn').onclick = ()=> vscode.postMessage({type:'close'});
  document.addEventListener('keydown', (ev)=>{
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    if (ev.code==='Space'){ ev.preventDefault(); vscode.postMessage({type:'reveal'}); }
    else if (ev.key==='1') grade('again');
    else if (ev.key==='2') grade('hard');
    else if (ev.key==='3') grade('good');
    else if (ev.key==='4') grade('easy');
  });
})();
</script>
</body>
</html>`;
}
