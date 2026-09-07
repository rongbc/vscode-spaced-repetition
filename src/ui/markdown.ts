// 复习面板 Markdown 渲染:与 VS Code 内置 Markdown 预览同引擎(markdown-it)
// + highlight.js 代码高亮。在扩展端(Node)把卡片文本渲染为 HTML 字符串,
// Webview 只负责 innerHTML 注入与样式,不引入任何浏览器端打包步骤。
// 安全基线:html:false —— 笔记内容里的原始 HTML 一律转义,不执行。

import * as fs from "fs";
import * as path from "path";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

export type MdThemeKind = "light" | "dark";

const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false, // 与 Markdown 预览一致:段落内的单个换行不产生 <br>
    highlight: (str: string, lang: string): string => {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return (
                    `<pre class="hljs"><code class="language-${md.utils.escapeHtml(lang)}">` +
                    hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                    "</code></pre>"
                );
            } catch {
                // 高亮失败退回纯文本围栏
            }
        }
        return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    },
});
md.enable("strikethrough"); // ~~删除线~~(内置规则,默认关闭)

/** 读取 highlight.js 某主题的 CSS(浅色 github / 深色 atom-one-dark)。 */
export function readHljsThemeCss(kind: MdThemeKind): string {
    const name = kind === "dark" ? "atom-one-dark" : "github";
    try {
        const p = require.resolve(`highlight.js/styles/${name}.css`);
        return fs.readFileSync(p, "utf8");
    } catch {
        return "";
    }
}

/**
 * 把 Markdown 图片 src 解析为本地绝对文件路径(含 ../ 折叠、越界拒绝、存在性检查)。
 * - noteDirAbs:当前笔记所在目录的绝对路径
 * - rootAbs:工作区根绝对路径;非空时拒绝解析到根目录之外
 * - 返回 null 表示无法作为本地图片加载(调用方应保留原 src)
 */
export function resolveLocalImageFsPath(
    noteDirAbs: string,
    src: string,
    rootAbs: string | null,
): string | null {
    const clean = src.split(/[?#]/)[0].trim();
    if (clean === "" || /^(data:|https?:|file:|vscode-webview-resource:)/i.test(clean)) return null;
    let decoded: string;
    try {
        decoded = decodeURIComponent(clean);
    } catch {
        decoded = clean;
    }
    const abs = path.normalize(
        path.isAbsolute(decoded) || /^[A-Za-z]:[\\/]/.test(decoded)
            ? decoded
            : path.join(noteDirAbs, decoded),
    );
    if (rootAbs !== null) {
        const rootNorm = path.normalize(rootAbs);
        if (abs !== rootNorm && !abs.startsWith(rootNorm + path.sep)) return null; // 越界
    }
    try {
        return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
    } catch {
        return null;
    }
}

/**
 * 渲染整段 Markdown 文本。
 * resolveLocalSrc:可选;把 markdown 图片的相对/绝对本地 src 映射为 webview
 * 可加载的 URI(通过 asWebviewUri)。返回 null 表示无法映射。
 */
export function renderFullMd(
    text: string,
    resolveLocalSrc?: (src: string) => string | null,
): string {
    let html = md.render(text);
    if (resolveLocalSrc) {
        html = html.replace(/<img\b[^>]*>/g, (tag: string) => {
            const m = tag.match(/\bsrc="([^"]+)"/);
            if (!m) return tag;
            const src = m[1];
            if (/^(data:|https?:|vscode-webview-resource:)/i.test(src)) return tag;
            const mapped = resolveLocalSrc(src);
            return mapped !== null ? tag.replace(m[0], `src="${mapped}"`) : tag;
        });
    }
    return html;
}
