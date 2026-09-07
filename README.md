# vscode-spaced-repetition (Spaced Repetition)

[简体中文](README.zh.md) | English

Review obsidian-spaced-repetition flashcards from Markdown notes right in VS Code.

Parsing syntax, scheduling-comment format and algorithm all match [obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) (OSR): it schedules due reviews with **SM-2 (OSR variant)** and writes the `<!--SR:!...-->` scheduling comments back into the note. The same note can therefore be switched between Obsidian and this extension, and review progress syncs across devices via git.

## Consistency with OSR

- **Card detection directly vendors the upstream code**: `src/lib/parser.ts` / `src/lib/question-type.ts` are copied verbatim from OSR v1.15.4 (only the import lines are replaced, body untouched); a smoke test compares block-by-block against the upstream `parse()`.
- The same comment format `<!--SR:!date,interval,ease-->` is written on the line **after** the card (matching OSR's default `cardCommentOnSameLine: false`).
- SM-2 formulas, defaults and the grade mapping are identical (baseEase 250 / easyBonus 1.3 / lapsesIntervalChange 0.5 / Again → ease −20, interval reset, etc.).
- Whole-note review: `#review` + frontmatter `sr-due / sr-interval / sr-ease`, with the same fields as OSR.

## Quick start (development)

1. Clone the repo, run `npm install`, and open the directory in VS Code.
2. Press **F5** to compile and launch the Extension Development Host.
3. In the host window, open your note vault with **File > Open Folder…** (or the workspace if you use a `.code-workspace`); the 🎴 "Spaced Repetition" activity-bar entry appears and the status bar shows due counts.

To use it for real, package a VSIX: `npm run package` (see package.json scripts, or use `@vscode/vsce`), then `code --install-extension vscode-spaced-repetition-*.vsix`.

Commands (Ctrl+Shift+P):

| Command | Description |
| --- | --- |
| `Review due flashcards (all due/new)` | Pick a deck (or all), review due + new cards |
| `Cram flashcards (ignore schedule)` | Ignore the algorithm schedule and review anything |
| `Open due note review queue` | Focus the sidebar "Due notes (#review)" |
| `Review current note and rate it` | Rate the open note that carries `#review` |

Commands, the activity-bar container and the view name are localized to the **VS Code UI language** (English `en` / Simplified Chinese `zh-cn`); the table above uses the English names.

Review panel: Space / "Show answer" flips the card, `1 Again / 2 Hard / 3 Good / 4 Easy`, and each button shows the next interval. The card body is rendered with **markdown-it** (the same engine as VS Code's built-in Markdown preview) plus **highlight.js**: tables, blockquotes, headings, lists, horizontal rules, strikethrough, inline code, links and images are supported; fenced code blocks get syntax highlighting and follow the active light/dark theme; runtime text (buttons, messages, card meta) is localized with the display language.

## Flashcard syntax (same as OSR)

**A blank line is a card boundary** (it ends the current card):

```
# Single-line / reversed
What does fork() return in the child process?::0
Implement the softirq bottom half with:::tasklet / workqueue

# Multi-line (multi-line question, ? on its own line, contiguous content, no blank lines)
What are the characteristics of the top half and bottom half of interrupt handling?
?
Top half: the interrupt handler — fast, must not sleep, handles urgent work.
Bottom half: softirq / tasklet / workqueue — deferred, may sleep.

# Reversed multi-line uses ??
```

Note (matching OSR): a blank line between `?` and the question/answer truncates the card (degenerate cards with an empty answer are skipped); only half-width `::` `:::` `?` `??` are separators; `::` inside normal text is also recognized as a card (OSR only excludes code fences and inline code `` `a::b` ``); cloze (`==highlight==`) is not yet enabled. After grading, the comment is written on the line after the card; reversed cards share one comment with a segment per side, and unreviewed sibling cards use the placeholder segment `!2000-01-01,1,250`; old comments written by Obsidian (end-of-line or on the next line) are recognized and reused.

Differences from OSR (all in the adaptation layer; the upstream body is untouched): ① before parsing, non-`<!--SR:` HTML comments are blanked out in the adaptation layer (the upstream mishandles multi-line HTML comments by deciding on the first line, swallowing subsequent content; fixed here deliberately); ② degenerate empty-answer cards are not queued; ③ cloze is disabled (passed to upstream as an empty pattern); ④ comment intervals are serialized to whole days, with no load-balance fuzzing.

## Deck source (setting `srs.deckSource`)

| Value | Behavior |
| --- | --- |
| `tag` (default, same as OSR) | Only notes with `#flashcards[…/subdeck]` are parsed; deck = tag path |
| `folder` | All notes participate; deck = folder (≈ OSR convertFoldersToDecks) |
| `tagAndFolder` | Only tagged notes are parsed; tag sub-path wins, otherwise the folder |

Tags can be written in the body or in frontmatter `tags`; a card can also carry `#flashcards/subdeck  Q::A` on its own line to assign it to a deck.

## Whole-note review (#review)

Notes tagged `#review` (body or frontmatter `tags: [review]`) enter the queue: the sidebar groups them by Overdue / Today / Future / New. Open a note, run `Review current note and rate it` and pick 1~4 — the schedule is written into frontmatter `sr-due/sr-interval/sr-ease` (other fields are preserved).

## Settings

`srs.language` (default `auto`) · `srs.flashcardTags` (default `["#flashcards"]`) · `srs.noteReviewTags` (default `["#review"]`) · `srs.deckSource` (default `tag`) · `srs.ignoreGlobs` (default excludes .git/.obsidian/.vscode/.agents/.trash/node_modules/.github) · `srs.baseEase / easyBonus / lapsesIntervalChange / maximumInterval`

### UI language (`srs.language`)

`auto` (default) follows the VS Code UI language (starts with `zh` → Simplified Chinese, otherwise English), or you can force `en` or `zh-cn`. Command titles, the activity-bar container and the view name are driven by the VS Code UI language (`package.nls.*`); in-panel runtime text is controlled by `srs.language`.

## Known limitations

- No OSR cloze cards; single-workspace mode; no statistics charts or reminders;
- If a note has unsaved edits while reviewing, the schedule write-back may fail due to text mismatch (save and retry);
- Write-back saves the whole document (unsaved edits are saved too; no content is lost).

## Layout

```
.vscode/launch.json / tasks.json / settings.json    # F5 debug config
src/lib/        # vendored from OSR v1.15.4: parser.ts / question-type.ts / compat (body untouched)
src/core/       # pure logic: dates, SM-2, model (unit-testable)
src/parser/     # md utils, flashcard adapter layer (calls the vendored parser), #review frontmatter
src/store/      # comment write-back (text-level)
src/i18n.ts     # en / zh-cn message dictionary with t(key, vars) formatter (display language srs.language)
src/ui/         # Webview review panel (markdown-it + highlight.js), due-note tree, status bar
src/workspace.ts / config.ts / extension.ts
package.nls.json / package.nls.zh-cn.json          # contribution-point title/view localization
test/           # English fixture + smoke tests (with upstream parse() parity)
    npm run compile   # tsc compilation
    npm run smoke     # parse parity / scheduling / write-back round-trip self-tests
    npm run package   # package a VSIX via @vscode/vsce
```

### Upstream sync (when maintaining the vendored code)

`src/lib/` comes from OSR v1.15.4. To upgrade: copy the corresponding files in and replace only the import lines (parser/question-type's CardType, SR_METADATA_CALLOUT and SRSettings come from `./compat`, helpers from `./strings`), then run `npm run smoke` and check the "upstream parser consistency" section for regressions.
