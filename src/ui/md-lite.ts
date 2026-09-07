// 超轻量 Markdown 渲染(仅用于闪卡复习面板展示,不引入第三方库)。

function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function inlineMd(s: string): string {
    let out = esc(s);
    // `code`
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // *italic*
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    return out;
}

/** 渲染:识别 ``` 代码围栏、标题、无序列表;其余按普通文本折行 */
export function renderMd(text: string): string {
    const lines = text.split("\n");
    const out: string[] = [];
    let fenceLang = "";
    for (const line of lines) {
        const fm = line.match(/^\s*```\s*(\S*)\s*$/);
        if (fm) {
            if (fenceLang !== "") {
                out.push("</pre>");
                fenceLang = "";
            } else {
                fenceLang = fm[1] || "";
                out.push("<pre>");
            }
            continue;
        }
        if (fenceLang !== "") {
            // 每个围栏行后必须带 \n:<pre> 内换行只能来自文本节点本身的换行符
            out.push(esc(line) + "\n");
            continue;
        }
        if (/^\s*$/.test(line)) {
            out.push("<br/>");
            continue;
        }
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
            const lvl = Math.min(h[1].length, 4);
            out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`);
            continue;
        }
        const li = line.match(/^\s*[-*+]\s+(.*)$/);
        if (li) {
            out.push(`<div class="li">• ${inlineMd(li[1])}</div>`);
            continue;
        }
        out.push(`<div class="line">${inlineMd(line)}</div>`);
    }
    if (fenceLang !== "") out.push("</pre>");
    return out.join("");
}
