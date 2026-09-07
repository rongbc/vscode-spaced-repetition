// 复习面板 Markdown 渲染:与 VS Code 内置 Markdown 预览同引擎(markdown-it)
// + highlight.js 代码高亮。在扩展端(Node)把卡片文本渲染为 HTML 字符串,
// Webview 只负责 innerHTML 注入与样式,不引入任何浏览器端打包步骤。
// 安全基线:html:false —— 笔记内容里的原始 HTML 一律转义,不执行。

import * as fs from "fs";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import katex from "katex";
import texmath from "markdown-it-texmath";

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
// LaTeX 公式:$…$ / $$…$$(KaTeX 服务端渲染成 HTML)
md.use(texmath, {
    engine: katex,
    delimiters: "dollars",
    katexOptions: { throwOnError: false, strict: false, trust: false },
});

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

/** KaTeX 的 CSS(公式渲染布局与字体回退)。 */
export function readKatexCss(): string {
    try {
        return fs.readFileSync(require.resolve("katex/dist/katex.min.css"), "utf8");
    } catch {
        return "";
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
