# vscode-spaced-repetition(间隔重复复习)

简体中文 | [English](README.md)

在 **VSCode** 中复习 Markdown 笔记里 obsidian-spaced-repetition 闪卡

解析语法、调度注释格式与算法都与[obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition)(下称 OSR)一致:用 **SM-2(OSR 变体)** 调度到期复习,并把 `<!--SR:!...-->` 调度注释写回笔记。因此同一份笔记可在 Obsidian 与本插件之间切换、跨设备随 git 同步复习进度。

## 与 OSR 的一致性

- **卡片识别直接 vendor 上游代码**:`src/lib/parser.ts` / `src/lib/question-type.ts` 原样拷自 OSR v1.15.4(仅替换 import,正文未改);另有冒烟测试与上游 `parse()` 逐组对拍;
- 注释格式 `<!--SR:!日期,间隔,难度-->` 相同,写回卡片**后一行**(对应 OSR 默认 `cardCommentOnSameLine: false`);
- SM-2 公式、默认参数与评级映射一致(baseEase 250 / easyBonus 1.3 / lapsesIntervalChange 0.5 / Again→难度−20、间隔归零等);
- 整篇笔记复习:`#review` + frontmatter `sr-due / sr-interval / sr-ease`,字段与 OSR 相同。

## 快速开始(开发调试)

1. 克隆本仓库后 `npm install`,用 VSCode 打开本目录;
2. 按 **F5**:编译并启动“扩展开发宿主”;
3. 在宿主窗口里 **File > Open Folder…** 打开你的笔记库(如含 `.code-workspace` 用打开工作区),侧边活动栏出现 🎴「间隔复习」入口,状态栏显示到期计数。

正式使用可打包 VSIX 安装:`npm run package`(见 package.json scripts,或用 `@vscode/vsce`),`code --install-extension vscode-spaced-repetition-*.vsix`。

命令(Ctrl+Shift+P):

| 命令 | 说明 |
| --- | --- |
| `复习到期闪卡 (全部到期/新卡)` | 选牌组(或全部),复习到期 + 新卡 |
| `突击复习闪卡 (忽略调度)` | 忽略算法调度,任意复习 |
| `打开到期笔记复习队列` | 聚焦侧边栏「到期笔记(#review)」 |
| `复习当前笔记并评级` | 对打开且带 `#review` 的笔记评级 |

命令、活动栏容器与视图名随 **VS Code 界面语言** 本地化(英语 `en` / 简体中文 `zh-cn`);上表为中文习惯名。

复习面板:空格/「显示答案」翻面,`1 重来 / 2 困难 / 3 良好 / 4 简单`,按钮上显示下次间隔。面板正文用 **markdown-it**(与 VSCode 内置 Markdown 预览同引擎)+ **highlight.js** 渲染:表格、引用、标题、列表、分割线、删除线、行内代码、链接与图片均支持,三反引号围栏的代码块带语法高亮,并按深浅主题自动切换配色;面板内运行期文案(按钮/消息/元信息)随显示语言本地化。

## 闪卡语法(与 OSR 一致)

**空行是卡片边界**(空行会结束当前卡片):

```
# 单行 / 反转
fork() 在子进程中的返回值是什么？::0
软中断下半部用什么实现:::tasklet / workqueue

# 多行(题目可多行,? 单独成行,前后内容连续、不留空行)
Linux 中断处理的上半部/下半部各有什么特点？
?
上半部：中断处理函数，要求快，禁止睡眠，处理紧急工作。
下半部：softirq / tasklet / workqueue，处理可延迟工作，允许睡眠。

# 多行反转用 ??
```

注意(与 OSR 行为一致):`?` 与题目/答案之间若有空行,卡片会被空行截断(空答案退化卡会被跳过);分隔符只有半角 `::` `:::` `?` `??`;普通文字行里的 `::` 也会被识别为卡(OSR 仅排除代码围栏与行内代码 `` `a::b` ``);`==高亮==` 等挖空(cloze)暂未启用。评级后注释写回卡片后一行;反转卡共享一个注释、每张一段,未复习兄弟卡用占位段 `!2000-01-01,1,250`;Obsidian 写过的旧注释(行尾或后一行)均可识别续用。

与 OSR 的差异(均在适配层,上游正文未动):① 解析前在适配层把“非 <!--SR: 的 HTML 注释”整段空行化(上游对跨行 HTML 注释的跳段误用首行判断,会吞掉后续内容,此处按意图修正);② 空答案退化卡不进入队列;③ cloze 未启用(以空 pattern 传入上游);④ 注释中间隔序列化取整为整数天、无 loadBalance 模糊化。

## 牌组来源(设置 `srs.deckSource`)

| 值 | 行为 |
| --- | --- |
| `tag`(默认,同 OSR) | 仅解析带 `#flashcards[…/子牌组]` 的笔记,牌组 = 标签路径 |
| `folder` | 全部笔记参与,牌组 = 文件夹(≈ OSR convertFoldersToDecks) |
| `tagAndFolder` | 仅解析带标签的笔记;标签子路径优先,否则文件夹 |

标签可写正文或 frontmatter `tags`;卡片行首也可写 `#flashcards/子牌组  Q::A` 单卡归类。

## 整篇笔记复习(#review)

笔记带 `#review`(正文或 frontmatter `tags: [review]`)进入队列:侧边栏按 过期/今日/未来/新笔记分组;打开后执行 `复习当前笔记并评级` 选 1~4,调度写入 frontmatter `sr-due/sr-interval/sr-ease`(其余字段保留)。

## 设置

`srs.language`(默认 `auto`)· `srs.flashcardTags`(默认 `["#flashcards"]`)· `srs.noteReviewTags`(默认 `["#review"]`)· `srs.deckSource`(默认 `tag`)· `srs.ignoreGlobs`(默认排除 .git/.obsidian/.vscode/.agents/.trash/node_modules/.github)· `srs.baseEase / easyBonus / lapsesIntervalChange / maximumInterval`

### 界面语言(`srs.language`)

`auto`(默认)跟随 VS Code 界面语言(以 `zh` 开头 → 简体中文,否则英语),也可固定为 `en` 或 `zh-cn`。命令标题、活动栏容器与视图名由 VS Code 界面语言驱动(`package.nls.*`);面板内运行期文案受 `srs.language` 控制。

## 已知限制

- 不实现 OSR 挖空卡(cloze);单工作区模式;无统计图表、无提醒;
- 复习期间同一篇笔记有未保存编辑时,评级写回可能因文本不一致失败(保存后重试);
- 写回会保存整个文档(未保存的编辑会一并保存,不会丢内容)。

## 目录

```
.vscode/launch.json / tasks.json / settings.json   # F5 调试配置
src/lib/        # vendor 自 OSR v1.15.4:parser.ts / question-type.ts / compat(正文未改)
src/core/       # 纯逻辑:日期、SM-2、模型(可单测)
src/parser/     # md 工具、闪卡适配层(调 lib 上游解析)、#review frontmatter
src/store/      # 注释写回(文本级)
src/i18n.ts     # en / zh-cn 文案字典与 t(key, vars) 格式化(显示语言 srs.language)
src/ui/         # Webview 复习面板(markdown-it + highlight.js)、到期笔记树、状态栏
src/workspace.ts / config.ts / extension.ts
package.nls.json / package.nls.zh-cn.json         # 贡献点标题/视图名本地化
test/           # 英文 fixture + 冒烟测试(含与上游 parse() 对拍)
    npm run compile   # tsc 编译
    npm run smoke     # 解析对拍 / 调度 / 写回回环自测
    npm run package   # @vscode/vsce 打包 VSIX
```

### 上游同步(维护 vendor 时)

`src/lib/` 来自 OSR v1.15.4。升级上游:把对应文件拷入并仅替换 import 行(parser/question-type 的 CardType、SR_METADATA_CALLOUT、SRSettings 来自 `./compat`,helper 来自 `./strings`),再跑 `npm run smoke` 的“与上游 parser 一致性”段确认无回归。
