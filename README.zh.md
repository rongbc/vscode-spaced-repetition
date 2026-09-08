# vscode-spaced-repetition（间隔重复复习）

简体中文 | [English](README.md)

<p align="center">
  <img src="media/spaced-repetition-icon.png" alt="间隔复习" width="128" />
</p>

![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue) ![License](https://img.shields.io/badge/license-MIT-blue) ![Algorithm](https://img.shields.io/badge/algorithm-SM--2%20(OSR%20variant)-orange) ![Compatible](https://img.shields.io/badge/compatible-obsidian--spaced--repetition-purple)

在 **VSCode** 里用 **SM-2（OSR 变体）** [间隔重复](https://en.wikipedia.org/wiki/Spaced_repetition)算法击败遗忘曲线，复习 [obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) 闪卡与整篇笔记。

- 解析语法、`<!--SR:!...-->` 调度注释格式与算法都与 **obsidian-spaced-repetition**（下称 OSR）一致：用 **SM-2（OSR 变体）** 调度到期复习，并把调度注释写回笔记。因此同一份笔记可在 Obsidian 与本插件之间切换，复习进度随 git 跨设备同步。
- 如有功能请求或 bug，欢迎提 [issue](https://github.com/rongbc/vscode-spaced-repetition/issues)。
- 界面本地化为_英语_与_简体中文_：命令标题、活动栏容器与视图名随 VS Code 界面语言切换。

<br/>

## 特性⚡

### 复习闪卡 🗃️

- 牌组来源：Obsidian 风格的层级 `#flashcards` 标签或文件夹结构（设置 `srs.deckSource`）
- 卡片样式（均与 OSR 兼容）：
  - 单行（`题目::答案`）与单行反转（`题目:::答案`）
  - 多行（`?` 单独成行）与多行反转（`??`）
  - 挖空（cloze）：`==高亮文本==` 以及 `srs.clozePatterns` 里的任意自定义模式——每个挖空各生成一张可复习卡，其余挖空作为上下文显示。
- 富文本卡片渲染，用 **markdown-it** + **highlight.js** + **KaTeX**：表格、引用、标题、列表、分割线、删除线、行内代码、链接、图片、语法高亮的围栏代码块，以及 LaTeX 公式。
- 卡片上下文取自标题，如 `笔记标题 > 一级标题 > 二级标题`。

### 复习整篇笔记 📄

- 用 `#review` 标签把整篇笔记标记为可复习；调度写入 frontmatter `sr-due / sr-interval / sr-ease`。
- 到期笔记队列按 _过期 / 今日 / 未来 / 新笔记_ 分组。

### 与 OSR 的兼容性 🔄

- 卡片识别直接 vendor 上游代码（`src/lib/parser.ts` / `src/lib/question-type.ts` 原样拷自 OSR v1.15.4，正文未改），并有冒烟测试与上游 `parse()` 逐组对拍。
- 注释格式 `<!--SR:!日期,间隔,难度-->` 相同，写回卡片**后一行**（对应 OSR 默认 `cardCommentOnSameLine: false`），Obsidian 写过的旧注释均可识别续用。

### 本地化 🌐

- 英语 / 简体中文，由 VS Code 界面语言（`auto`）或设置 `srs.language` 驱动。

<br/>
<br/>

## 快速上手 🚀

### 1. 安装并打开笔记库

1. 克隆本仓库后 `npm install`，用 VSCode 打开本目录；按 **F5** 启动「扩展开发宿主」。
2. 在宿主窗口里 **File > Open Folder…** 打开你的笔记库（如含 `.code-workspace` 用打开工作区）：活动栏出现 🎴「间隔复习」入口，状态栏显示到期计数。

正式使用可打包 VSIX（`npm run package`，或用 `@vscode/vsce`）并安装：`code --install-extension vscode-spaced-repetition-*.vsix`。

### 2. 创建牌组

在要写卡片的笔记里加上 `#flashcards` 标签。要归入子牌组就用 `#flashcards/YOUR_SUB_DECK_NAME`。卡片行首也可写 `#flashcards/子牌组` 单卡归类。

### 3. 创建卡片

- 单行 -> `题目::答案`
- 单行反转 -> `题目:::答案`
- 多行 -> `题目` / `?`（单独成行） / `答案`
- 多行反转 -> `题目` / `??`（单独成行） / `答案`

**空行是卡片边界**（会结束当前卡片），每张卡内容要保持连续、不留空行。

### 4. 复习闪卡

打开命令面板（Ctrl+Shift+P）选择：

| 命令 | 说明 |
| --- | --- |
| `复习到期闪卡 (全部到期/新卡)` | 选牌组（或全部），复习到期 + 新卡 |
| `突击复习闪卡 (忽略调度)` | 忽略算法调度，任意复习 |
| `打开到期笔记复习队列` | 聚焦侧边栏「到期笔记(#review)」 |
| `复习当前笔记并评级` | 对打开且带 `#review` 的笔记评级 |

选中牌组后，对当前卡片评级你的记忆程度：按 **空格** /「显示答案」翻面，再按 **`1` 重来 / `2` 困难 / `3` 良好 / `4` 简单**——每个按钮显示下次间隔天数。

### 5. 复习整篇笔记

1. 给笔记加 `#review` 标签标记为可复习。
2. 执行 `打开到期笔记复习队列` 查看到期笔记。
3. 打开笔记，执行 `复习当前笔记并评级` 选 1~4；新的到期日期写入 frontmatter `sr-due/sr-interval/sr-ease`。

<br/>

## 闪卡语法（与 OSR 一致）

**空行是卡片边界**（会结束当前卡片）：

```
# 单行 / 反转
fork() 在子进程中的返回值是什么？::0
软中断下半部用什么实现:::tasklet / workqueue

# 多行（题目可多行，? 单独成行，内容连续、不留空行）
Linux 中断处理的上半部/下半部各有什么特点？
?
上半部：中断处理函数，要求快，禁止睡眠，处理紧急工作。
下半部：softirq / tasklet / workqueue，处理可延迟工作，允许睡眠。

# 多行反转用 ??

# 挖空（cloze,每个 ==…== 各成一卡,被问的显示 [...],其余作为上下文）
用户态进程通过 ==系统调用== 进入 ==内核==。
```

注意（与 OSR 行为一致）：`?` 与题目/答案之间若有空行，卡片会被空行截断（空答案退化卡会被跳过）；分隔符只有半角 `::` `:::` `?` `??`；普通文字行里的 `::` 也会被识别为卡（OSR 仅排除代码围栏与行内代码 `` `a::b` ``）；挖空（cloze）已支持，默认 `==高亮==`，每个挖空各成为一张可复习卡——一个 `<!--SR:...-->` 注释为每个挖空各存一段，未复习兄弟挖空用占位段。评级后注释写回卡片后一行；反转卡共享一个注释、每张一段，未复习兄弟卡用占位段 `!2000-01-01,1,250`。

## 牌组来源（设置 `srs.deckSource`）

| 值 | 行为 |
| --- | --- |
| `tag`（默认，同 OSR） | 仅解析带 `#flashcards[…/子牌组]` 的笔记，牌组 = 标签路径 |
| `folder` | 全部笔记参与，牌组 = 文件夹（≈ OSR convertFoldersToDecks） |
| `tagAndFolder` | 仅解析带标签的笔记；标签子路径优先，否则文件夹 |

标签可写正文或 frontmatter `tags`。

## 设置

`srs.language`（默认 `auto`）· `srs.flashcardTags`（默认 `["#flashcards"]`）· `srs.noteReviewTags`（默认 `["#review"]`）· `srs.deckSource`（默认 `tag`）· `srs.ignoreGlobs`（默认排除 .git/.obsidian/.vscode/.agents/.trash/node_modules/.github）· `srs.clozePatterns`（默认 `["==[123;;]answer[;;hint]=="]`，即 `==高亮==` 视为挖空；空数组关闭 cloze）· `srs.baseEase / easyBonus / lapsesIntervalChange / maximumInterval`

### 界面语言（`srs.language`）

`auto`（默认）跟随 VS Code 界面语言（以 `zh` 开头 → 简体中文，否则英语），也可固定为 `en` 或 `zh-cn`。命令标题、活动栏容器与视图名由 VS Code 界面语言驱动（`package.nls.*`）；面板内运行期文案受 `srs.language` 控制。

## 已知限制

- 单工作区模式；无统计图表、无提醒。
- 复习期间同一篇笔记有未保存编辑时，评级写回可能因文本不一致失败（保存后重试）。
- 写回会保存整个文档（未保存的编辑会一并保存，不会丢内容）。

## 与 OSR 的一致性是如何保持的

所有差异均在适配层，上游正文未动：解析前把“非 `<!--SR:` 的 HTML 注释”整段空行化（上游对跨行 HTML 注释的跳段误用首行判断，会吞掉后续内容）、空答案退化卡不进入队列、挖空（cloze）模式可配置（默认与 OSR 一致为 `==…==`），但挖空卡用纯文本形式化器渲染而非 OSR 的内联 HTML span（以契合 `html:false` 的渲染基线）、注释中间隔取整为整数天且无 loadBalance 模糊化。

## 链接与资源 🔗

- [仓库](https://github.com/rongbc/vscode-spaced-repetition)
- [Issues](https://github.com/rongbc/vscode-spaced-repetition/issues)
- [obsidian-spaced-repetition（上游）](https://github.com/st3v3nmw/obsidian-spaced-repetition)

## 开发

```
.vscode/launch.json / tasks.json / settings.json   # F5 调试配置
src/lib/        # vendor 自 OSR v1.15.4：parser.ts / question-type.ts / compat（正文未改）
src/core/       # 纯逻辑：日期、SM-2、模型（可单测）
src/parser/     # md 工具、闪卡适配层（调 lib 上游解析）、#review frontmatter
src/store/      # 注释写回（文本级）
src/i18n.ts     # en / zh-cn 文案字典与 t(key, vars) 格式化（显示语言 srs.language）
src/ui/         # Webview 复习面板（markdown-it + highlight.js + KaTeX）、到期笔记树、状态栏
src/workspace.ts / config.ts / extension.ts
package.nls.json / package.nls.zh-cn.json         # 贡献点标题/视图名本地化
test/           # 英文 fixture + 冒烟测试（含与上游 parse() 对拍）
```

脚本：`npm run compile`（tsc）· `npm run smoke`（解析对拍 / 调度 / 写回回环）· `npm run package`（`@vscode/vsce` 打包 VSIX）。

### 上游同步（维护 vendor 时）

`src/lib/` 来自 OSR v1.15.4。升级上游：把对应文件拷入并仅替换 import 行（parser/question-type 的 `CardType`、`SR_METADATA_CALLOUT` 与 `SRSettings` 来自 `./compat`，helper 来自 `./strings`），再跑 `npm run smoke` 的「与上游 parser 一致性」段确认无回归。

## 许可证

[MIT](LICENSE)
