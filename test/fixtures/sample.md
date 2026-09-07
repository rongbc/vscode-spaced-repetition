# 闪卡解析 fixture

本文用于验证插件解析器。语法与 obsidian-spaced-repetition 完全一致:
空行即卡片边界;单行卡 `::`/`:::`;多行卡 `?`/`??` 单独成行、前后内容连续(无空行间隔)。

#flashcards/嵌入式/中断

# 定时器与中断

## 上半部下半部

中断处理的上半部/下半部各有什么特点？
?
上半部：中断处理函数，要求快，禁止睡眠，处理紧急工作。
下半部：softirq / tasklet / workqueue，处理可延迟工作，允许睡眠。
```c
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dates = require(join(root, "out/core/dates.js"));
const sm2 = require(join(root, "out/core/sm2.js"));
const model = require(join(root, "out/core/model.js"));
const flashcards = require(join(root, "out/parser/flashcards.js"));
const noteReview = require(join(root, "out/parser/note-review.js"));
const writer = require(join(root, "out/store/note-writer.js"));
const mdLite = require(join(root, "out/ui/md-lite.js"));
```

## 单行卡

`fork()` 在子进程中的返回值是什么？::0

`fork()` 在父进程中的返回值是什么？::子进程 PID

Question ::Answer

## 行首标签卡

#flashcards/科学 高亮文本::这是一张带行首标签的单卡

## 反转卡

反转示例:::反过来也能考

## 多行反转

LED 亮灭原理
??
GPIO 输出电平翻转即可

<!-- 这段注释不该解析出任何卡片 -->
