// 冒烟测试:直接 require 编译产物,校验 SM-2 调度 / OSR 一致的解析 / 注释写回回环 / 笔记 frontmatter。
// 运行:cd .vscode/extensions/spaced-repetition && node test/smoke.mjs

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dates = require(join(root, "out/core/dates.js"));
const sm2 = require(join(root, "out/core/sm2.js"));
const model = require(join(root, "out/core/model.js"));
const flashcards = require(join(root, "out/parser/flashcards.js"));
const noteReview = require(join(root, "out/parser/note-review.js"));
const writer = require(join(root, "out/store/note-writer.js"));
const fullMd = require(join(root, "out/ui/markdown.js"));

const cfg = { ...model.DEFAULT_CONFIG };
let failed = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ✗ ${name}\n    ${e.message}`);
    }
}
const todays = () => dates.todayStr();
// 合成用例默认用 folder 牌组(避免 tag 模式把无标签文本滤掉);需要 tag 语义时显式覆盖
const parse = (text, over = {}) =>
    flashcards.parseFlashcards("x.md", text, { ...cfg, deckSource: "folder", ...over });
const one = (text, over) => {
    const r = parse(text, over);
    assert.strictEqual(r.blocks.length, 1, `期望 1 个块,实际 ${r.blocks.length}`);
    return r.blocks[0];
};

console.log("== SM-2 调度 ==");
check("新卡 easy: 难度 270、间隔 (1*270/100)*1.3=3.51 -> 序列化 4、到期今天+4", () => {
    const s = sm2.newCardSchedule("easy", cfg);
    assert.strictEqual(s.ease, 270);
    assert.strictEqual(s.interval, 4);
    assert.strictEqual(s.due, dates.addDays(todays(), 4));
});
check("新卡 hard: 难度 230、间隔 1、到期明天", () => {
    const s = sm2.newCardSchedule("hard", cfg);
    assert.strictEqual(s.ease, 230);
    assert.strictEqual(s.interval, 1);
    assert.strictEqual(s.due, dates.addDays(todays(), 1));
});
check("新卡 again: 难度 230、间隔 0、到期今天", () => {
    const s = sm2.newCardSchedule("again", cfg);
    assert.strictEqual(s.ease, 230);
    assert.strictEqual(s.interval, 0);
    assert.strictEqual(s.due, todays());
});
check("复习 good: (34+0)*290/100 = 98.6", () => {
    const calc = sm2.osrSchedule("good", 34, 290, 0, cfg);
    assert.ok(Math.abs(calc.interval - 98.6) < 1e-9);
    assert.strictEqual(calc.ease, 290);
});
check("ease 下限 130", () => {
    const calc = sm2.osrSchedule("again", 10, 140, 0, cfg);
    assert.strictEqual(calc.ease, 130);
});

console.log("== 解析:镜像原仓库 parser.test 的行为 ==");
check("单行卡 'Question::Answer'", () => {
    const b = one("Question::Answer");
    assert.strictEqual(b.sides.length, 1);
    assert.strictEqual(b.sides[0].front, "Question");
    assert.strictEqual(b.sides[0].back, "Answer");
});
check("行首普通文本不干扰,后续行才是卡", () => {
    const r = parse("Some text before\nQuestion ::Answer");
    assert.strictEqual(r.blocks.length, 1);
    assert.strictEqual(r.blocks[0].sides[0].front, "Question");
});
check("行首闪卡标签卡 '#flashcards/science Question ::Answer' 牌组=science", () => {
    const b = one("#flashcards/science Question ::Answer");
    assert.strictEqual(b.deck, "science");
});
check("反转卡 Q:::A -> 两张(正反)", () => {
    const b = one("Q:::A");
    assert.ok(b.reversed);
    assert.strictEqual(b.sides.length, 2);
    assert.strictEqual(b.sides[1].front, "A");
    assert.strictEqual(b.sides[1].back, "Q");
});
check("单行卡吸收后一行注释(OSR:下一行以 <!--SR: 开头)", () => {
    const b = one("Question::Answer\n<!--SR:!2021-08-11,4,270-->");
    assert.strictEqual(b.comment, "!2021-08-11,4,270");
    assert.ok(b.commentOnNextLine);
    assert.deepStrictEqual(b.segs[0], { due: "2021-08-11", interval: 4, ease: 270 });
    assert.strictEqual(b.contentLines.length, 1);
});
check("单行卡同行行尾注释也能识别", () => {
    const b = one("Question::Answer <!--SR:2021-08-11,4,270-->");
    assert.strictEqual(b.commentOnNextLine, false);
    assert.strictEqual(b.sides[0].back, "Answer");
});
check("多行卡 'Q\\n?\\nA'", () => {
    const b = one("Question\n?\nAnswer");
    assert.strictEqual(b.sides[0].front, "Question");
    assert.strictEqual(b.sides[0].back, "Answer");
});
check("多行卡题目可多行(空行才结束)", () => {
    const b = one("Question line 1\nQuestion line 2\n?\nAnswer line 1\nAnswer line 2");
    assert.strictEqual(b.sides[0].front, "Question line 1\nQuestion line 2");
    assert.strictEqual(b.sides[0].back, "Answer line 1\nAnswer line 2");
});
check("多行反转 ?? -> 两张", () => {
    const b = one("Q1\n??\nA1");
    assert.ok(b.reversed);
    assert.strictEqual(b.sides[1].front, "A1");
});
check("空行是卡片边界:空行隔开的两个多行卡", () => {
    const r = parse("#Title\n\nLine0\nQ1\n?\nA1\nAnswerExtra\n\nQ2\n?\nA2");
    assert.strictEqual(r.blocks.length, 2, "应为两张多行卡");
    assert.strictEqual(r.blocks[0].sides[0].front, "Line0\nQ1");
    assert.strictEqual(r.blocks[0].sides[0].back, "A1\nAnswerExtra");
    assert.strictEqual(r.blocks[1].sides[0].front, "Q2");
});
check("? 与答案之间空行 -> 空答案卡被跳过(与 OSR 的空行边界规则一致)", () => {
    const r = parse("Question\n?\n\nAnswer line 1");
    assert.strictEqual(r.blocks.length, 0);
});
check("? 前空行 -> 题目丢失,不构成卡", () => {
    const r = parse("Question\n\n?\nAnswer");
    assert.strictEqual(r.blocks.length, 0);
});
check("行内代码中的 :: 不识别(反引号奇偶)", () => {
    const r = parse("使用 `a::b` 写法说明");
    assert.strictEqual(r.blocks.length, 0);
});
check("代码围栏内容不参与检测", () => {
    const r = parse("```\nQ::A\n?\nB\n```");
    assert.strictEqual(r.blocks.length, 0);
});
check("HTML 注释整体跳过", () => {
    const r = parse("<!-- 说明\nQ::A\n-->\n\n真卡::答案");
    assert.strictEqual(r.blocks.length, 1);
    assert.strictEqual(r.blocks[0].sides[0].front, "真卡");
});
check("无标签笔记 + deckSource=tag -> 不解析(OSR 默认)", () => {
    const r = parse("Question::Answer", { deckSource: "tag" });
    assert.strictEqual(r.blocks.length, 0);
});
check("笔记级 #flashcards/子牌组 标签 -> 牌组=子牌组", () => {
    const r = parse("#flashcards/嵌入式/中断\n\nQ::A", { deckSource: "folder" });
    assert.strictEqual(r.blocks.length, 1);
    assert.strictEqual(r.blocks[0].deck, "嵌入式/中断");
});

console.log("== fixture 整篇 ==");
const sampleText = readFileSync(join(root, "test/fixtures/sample.md"), "utf8");
const parsed = parse(sampleText, { deckSource: "folder" });
const B = parsed.blocks;
const frontCount = (sub) => B.filter((b) => b.sides[0].front.includes(sub)).length;
check("块数=7(interrupt halves、fork child、fork parent、plain、C++ tag、reverse、LED)", () => {
    assert.strictEqual(B.length, 7, JSON.stringify(B.map((b) => b.sides[0].front.slice(0, 16))));
});
check("行首标签卡牌组=cpp,覆盖笔记标签", () => {
    const b = B.find((x) => x.sides[0].front.includes("created C++"));
    assert.ok(b);
    assert.strictEqual(b.deck, "cpp");
});
check("普通卡牌组=os/interrupts(标签路径)", () => {
    for (const b of B) {
        if (b.deck === "cpp") continue;
        assert.strictEqual(b.deck, "os/interrupts", b.sides[0].front);
    }
});
check("HTML 注释内无卡", () => {
    assert.strictEqual(frontCount("must not become any card"), 0);
});

console.log("== 复习面板全量渲染(markdown-it + highlight.js)==");
{
    const b = B.find((x) => x.sides[0].front.includes("top half"));
    assert.ok(b);
    const html = fullMd.renderFullMd(b.sides[0].back);
    check("代码围栏高亮渲染:c 语言 -> language-c 与 hljs 令牌,换行保留", () => {
        assert.ok(html.includes("softirq"), "多行卡答案 HTML 不应为空");
        assert.ok(html.includes('<pre class="hljs"><code class="language-c">'), "缺少高亮围栏开头");
        assert.ok(html.includes("</code></pre>"));
        const code = html.slice(html.indexOf('<pre class="hljs">'));
        assert.ok(code.includes("\n"), "围栏内换行应保留");
        assert.ok(/<span class="hljs-/.test(html), "应有 hljs 令牌着色 span");
    });
    check("fixture 卡1 答案覆盖:表格/引用/hr/标题/列表/链接/图片/删除线", () => {
        for (const w of [
            "<table>",
            "<blockquote>",
            "<hr>",
            "<h3>Deferred work</h3>",
            "<ul>",
            '<a href="https://docs.kernel.org/">',
            "<img src=",
            "<s>deprecated</s>",
            "<code>softirq</code>",
        ]) {
            assert.ok(html.includes(w), `fixture 渲染缺少: ${w}`);
        }
    });
    check("表格/引用/列表/删除线等元素完整渲染", () => {
        const t = "|a|b|\n|-|-|\n|1|2|\n\n> 引用\n\n- 项1\n- 项2\n\n~~划掉~~";
        const h = fullMd.renderFullMd(t);
        assert.ok(h.includes("<table>") && h.includes("<th>a</th>"), "表格缺失");
        assert.ok(h.includes("<blockquote>"), "引用缺失");
        assert.ok(h.includes("<li>项1</li>"), "列表缺失");
        assert.ok(h.includes("<s>划掉</s>"), "删除线缺失");
    });
    check("html:false —— 笔记内原始 HTML 被转义不执行", () => {
        const h = fullMd.renderFullMd('<script>alert(1)</script> 与 <b>x</b>');
        assert.ok(!h.includes("<script>"), "script 未被转义");
        assert.ok(h.includes("&lt;script&gt;"), "应输出转义文本");
        assert.ok(!/<b>x<\/b>/.test(h), "行内 HTML 不应原样输出");
    });
    check("本地图片经 resolveLocalSrc 钩子改写 src", () => {
        const h = fullMd.renderFullMd("![图](img/a.png)", (s) => "webview://" + s);
        assert.ok(h.includes('src="webview://img/a.png"'), h);
    });
    check("深色 hljs 主题 CSS 可读取", () => {
        const css = fullMd.readHljsThemeCss("dark");
        assert.ok(css.includes(".hljs-keyword"), "缺少 hljs 令牌样式");
    });
}

console.log("== 与 vendor 上游 parser 的一致性 ==");
{
    const libParser = require(join(root, "out/lib/parser.js"));
    const compat = require(join(root, "out/lib/compat.js"));
    const upOpts = {
        singleLineCardSeparator: "::",
        singleLineReversedCardSeparator: ":::",
        multilineCardSeparator: "?",
        multilineReversedCardSeparator: "??",
        multilineCardEndMarker: "",
        clozePatterns: [],
    };
    const corpus = [
        "Q::A",
        "#flashcards/science Question ::Answer",
        "Some text before\nQuestion ::Answer",
        "Q:::A",
        "Question::Answer\n<!--SR:!2021-08-11,4,270-->",
        "Question::Answer <!--SR:2021-08-11,4,270-->",
        "Question\n?\nAnswer",
        "Question line 1\nQuestion line 2\n?\nAnswer line 1\nAnswer line 2",
        "Q1\n??\nA1",
        "#Title\n\nLine0\nQ1\n?\nA1\nAnswerExtra\n\nQ2\n?\nA2",
        "使用 `a::b` 写法说明",
        "```\nQ::A\n?\nB\n```",
        "问？\n？\n答",
        "# 标题\n\nQ::A\nQ2::A2",
    ];
    const isEmptyBack = (info) => {
        if (info.cardType < 2) return false; // 仅多行可能空答案
        const lines = info.text.split("\n");
        const si = lines.findIndex((l) => l.trim() === "?" || l.trim() === "??");
        return si >= 0 && lines.slice(si + 1).every((l) => l.trim() === "");
    };
    let mismatches = 0;
    for (const t of corpus) {
        const up = libParser
            .parse(t, upOpts)
            .filter((i) => i.cardType !== compat.CardType.Cloze && !isEmptyBack(i));
        const my = flashcards.parseFlashcards("x.md", t, { ...cfg, deckSource: "folder" });
        if (up.length !== my.blocks.length) {
            mismatches++;
            console.error(`    不一致: ${JSON.stringify(t)} upstream=${up.length} ours=${my.blocks.length}`);
        }
    }
    check("14 组用例:块数与上游 parse() 完全一致(不含被丢弃的空答案卡)", () => {
        assert.strictEqual(mismatches, 0, `有 ${mismatches} 组不一致`);
    });
}

console.log("== 写回回环 ==");
{
    const target = B.find((x) => x.sides[0].front.includes("child process"));
    const ord = B.indexOf(target);
    const newSeg = { due: dates.addDays(todays(), 4), interval: 4, ease: 270 };
    const text2 = writer.setCardScheduleText(sampleText, cfg, "x.md", ord, [newSeg]);
    assert.ok(
        text2.includes(`in the child process returns?::0\n<!--SR:!${newSeg.due},4,270-->`),
        "新注释应写在卡片后一行",
    );
    const p2 = flashcards.parseFlashcards("x.md", text2, cfg);
    assert.strictEqual(p2.blocks.length, B.length, "写回后块数不变");
    const t2 = p2.blocks[ord];
    assert.deepStrictEqual(t2.segs[0], newSeg);
    // 第二次评级:原位更新,不产生重复注释
    const newSeg2 = { due: dates.addDays(todays(), 100), interval: 100, ease: 290 };
    const text3 = writer.setCardScheduleText(text2, cfg, "x.md", ord, [newSeg2]);
    assert.strictEqual((text3.match(/<!--SR:/g) || []).length, 1);
    assert.ok(text3.includes(`<!--SR:!${newSeg2.due},100,290-->`));
}
{
    // 反转卡首次写回:真实段 + 占位段
    const target = B.find((x) => x.sides[0].front.includes("Reverse me"));
    const ord = B.indexOf(target);
    const newSeg = { due: dates.addDays(todays(), 4), interval: 4, ease: 270 };
    const text = writer.setCardScheduleText(sampleText, cfg, "x.md", ord, [newSeg, null]);
    const p = flashcards.parseFlashcards("x.md", text, cfg);
    const tb = p.blocks[ord];
    assert.ok(tb && tb.comment && tb.comment.includes(`!${newSeg.due},4,270!2000-01-01,1,250`));
}
{
    // 多行卡写回:答案内容不被破坏
    const target = B.find((x) => x.sides[0].front.includes("LED blink"));
    const ord = B.indexOf(target);
    const newSeg = { due: dates.addDays(todays(), 4), interval: 4, ease: 270 };
    const text = writer.setCardScheduleText(sampleText, cfg, "x.md", ord, [newSeg, null]);
    const p = flashcards.parseFlashcards("x.md", text, cfg);
    const tb = p.blocks.find((x) => x.sides[0].front.includes("LED blink"));
    assert.ok(tb && tb.sides[0].back.includes("GPIO"), "多行卡答案被破坏");
    assert.strictEqual(p.blocks.length, B.length);
}

console.log("== 整篇笔记 #review ==");
{
    const body1 = "# 笔记\n正文内容。\n#review\n更多内容。\n";
    check("正文 #review 标签识别", () => {
        assert.ok(noteReview.noteHasReviewTag(body1, cfg));
        assert.ok(!noteReview.noteHasReviewTag("# 笔记\n无标签\n", cfg));
    });
    check("frontmatter tags: [review] 识别", () => {
        const t = "---\ntags: [review, x]\n---\n正文\n";
        assert.ok(noteReview.noteHasReviewTag(t, cfg));
    });
    const noFm = "# 标题\n#review\n正文\n";
    const withSr = noteReview.writeNoteSr(noFm, { due: "2026-01-01", interval: 5, ease: 250 });
    check("无 frontmatter 时写入会创建并含 sr-due/sr-interval/sr-ease", () => {
        assert.ok(withSr.startsWith("---\nsr-due: 2026-01-01\nsr-interval: 5\nsr-ease: 250\n---\n"));
        const r = noteReview.readNoteSr(withSr);
        assert.strictEqual(r.due, "2026-01-01");
        assert.strictEqual(r.interval, 5);
        assert.strictEqual(r.ease, 250);
    });
    const fm2 = "---\ntags: [x]\nsr-due: 2025-01-01\nother: keep\n---\n正文\n";
    const updated = noteReview.writeNoteSr(fm2, { due: "2026-02-02", interval: 9, ease: 270 });
    check("已有 frontmatter:原位更新且保留其它 key", () => {
        assert.ok(updated.includes("tags: [x]"));
        assert.ok(updated.includes("other: keep"));
        assert.ok(updated.includes("sr-due: 2026-02-02"));
        assert.ok(!updated.includes("sr-due: 2025-01-01"));
    });
}

console.log(failed === 0 ? "\n全部通过 ✔" : `\n${failed} 项失败 ✘`);
process.exit(failed === 0 ? 0 : 1);
