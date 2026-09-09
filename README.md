# vscode-spaced-repetition (Spaced Repetition)

[简体中文](README.zh.md) | English

<p align="center">
  <img src="media/spaced-repetition-icon.png" alt="Spaced Repetition" width="128" />
</p>

![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue) ![License](https://img.shields.io/badge/license-MIT-blue) ![Algorithm](https://img.shields.io/badge/algorithm-FSRS%20(default)%20%2F%20SM--2%20(OSR%20variant)-orange) ![Compatible](https://img.shields.io/badge/compatible-obsidian--spaced--repetition-purple)

Fight the forgetting curve by reviewing [obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) flashcards & notes right in VS Code, scheduling with **FSRS by default** — the [free spaced repetition scheduler](https://github.com/open-spaced-repetition/fsrs4anki) used by Anki (via its official TypeScript port [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)) — or with the classic **SM-2 (OSR variant)** when you opt out.

- Parsing syntax and the `<!--SR:...-->` scheduling-comment formats all match **obsidian-spaced-repetition** (OSR): new reviews are scheduled with **FSRS** and written back in the same `<!--SR:!fsrs,...-->` comment format as OSR's FSRS support, while legacy SM-2 comments (`<!--SR:!date,interval,ease-->`) are read and migrated to FSRS on their next review. The same note can be switched between Obsidian and this extension, and review progress syncs across devices via git.
- Set `srs.algorithm` to `SM-2-OSR` to go back to the original SM-2 (OSR variant) scheduler; FSRS comments are then converted back to SM-2 as cards are reviewed.
- Raise an [issue](https://github.com/rongbc/vscode-spaced-repetition/issues) if you have a feature request or a bug report.
- The UI is localized to _English_ and _Simplified Chinese_; command titles, the activity-bar container and the view name follow the VS Code UI language.

<br/>

## Features⚡

### Scheduling algorithms 🧠

- **FSRS is the default algorithm** (`srs.algorithm`, default `fsrs`). The scheduler is [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — the official TypeScript port of the FSRS4Anki algorithm — with the same parameter mapping as OSR's FSRS support: short-term (re)learning steps enabled and desired retention adjustable via `srs.fsrsDesiredRetention` (default `0.9`).
- Scheduling comments are written in OSR's FSRS format: `<!--SR:!fsrs,due,interval,stability,difficulty,state,reps,lapses,learningSteps,lastReview-->` (per reviewable card, one `!`-segment each), so a vault can be reviewed by both Obsidian and this extension under FSRS.
- **Legacy SM-2 cards keep working**: old `<!--SR:!date,interval,ease-->` comments are parsed and, when such a card is next reviewed under FSRS, migrated to the FSRS format (import helper mirrors OSR's `sm2ScheduleToFsrsCard`). Set `srs.algorithm` to `SM-2-OSR` to use the original SM-2 (OSR variant) scheduler instead — FSRS comments are then written back as SM-2 (`ease` is derived from `difficulty`) as cards are reviewed, so you can switch algorithms at any time without data loss.
- Whole-note (`#review`) reviews stay on the SM-2 (OSR variant) schedule in frontmatter `sr-due / sr-interval / sr-ease`, matching obsidian-spaced-repetition, which has no FSRS note-format yet.

### Reviewing flashcards 🗃️

- Deck source via Obsidian-style hierarchical `#flashcards` tags or folder structure (setting `srs.deckSource`)
- Card styles (all compatible with OSR):
  - Single-line (`Question::Answer`) and single-line reversed (`Question:::Answer`)
  - Multi-line (a `?` on its own line) and multi-line reversed (`??`)
  - Cloze (fill-in-the-blank): `==highlighted text==` as well as any custom pattern in `srs.clozePatterns` — one reviewable card per cloze deletion, with the rest of the note shown as context.
- Rich card rendering with **markdown-it** + **highlight.js** + **KaTeX**: tables, blockquotes, headings, lists, horizontal rules, strikethrough, inline code, links, images, syntax-highlighted fenced code blocks, and LaTeX math.
- Card context from headings, e.g. `Note title > Heading 1 > Subheading`.

### Reviewing whole notes 📄

- Mark a whole note for review with the `#review` tag; the schedule is stored in frontmatter `sr-due / sr-interval / sr-ease`.
- A due-note queue grouped by _Overdue / Today / Future / New_.

### OSR compatibility 🔄

- This extension is designed to remain compatible with [obsidian-spaced-repetition (OSR)](https://github.com/st3v3nmw/obsidian-spaced-repetition).
- The card parser, question-type implementation and their support helpers are vendored from obsidian-spaced-repetition **v1.15.4**: `src/lib/parser.ts`, `src/lib/question-type.ts`, `src/lib/compat.ts`, `src/lib/strings.ts`. These files are derived from the upstream implementation (body untouched apart from the import/adaptation lines) and remain under the upstream MIT License, Copyright (c) 2021 - 2024 Stephen Mwangi; the rest of this repository is developed independently for the VS Code extension. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the full third-party license notice.
- A smoke test compares the vendored parser block-by-block against the upstream `parse()`.
- Both scheduling-comment formats are recognized and written on the line **after** the card (OSR's default `cardCommentOnSameLine: false`): the legacy SM-2 format `<!--SR:!date,interval,ease-->` and the FSRS format `<!--SR:!fsrs,...-->` used by OSR's FSRS support. A card comment may even mix both formats (e.g. a reversed/cloze card where one side was reviewed under FSRS and a sibling is still an unreviewed SM-2 placeholder).

### Localization 🌐

- English / Simplified Chinese, driven by the VS Code UI language (`auto`) or the `srs.language` setting.

<br/>
<br/>

## Usage TL;DR 🚀

### 1. Install & open your vault

1. Clone the repo, run `npm install`, and open the directory in VS Code. Press **F5** to launch the Extension Development Host.
2. In the host window, open your note vault with **File > Open Folder…** (or the workspace if you use a `.code-workspace`): the 🎴 "Spaced Repetition" activity-bar entry appears and the status bar shows due counts.

To use it for real, package a VSIX (`npm run package`, or use `@vscode/vsce`) and install it with `code --install-extension vscode-spaced-repetition-*.vsix`.

### 2. Create decks

Add the tag `#flashcards` in a note where you want to write cards. To put cards in a sub-deck, use `#flashcards/YOUR_SUB_DECK_NAME`. Cards can also be assigned a deck by writing `#flashcards/subdeck` on their own line.

### 3. Create cards

- Single line -> `Question::Answer`
- Single line reversed -> `Question:::Answer`
- Multi line -> `Question` / `?` (own line) / `Answer`
- Multi line reversed -> `Question` / `??` (own line) / `Answer`

A **blank line is a card boundary** (it ends the current card) — keep each card's content contiguous.

### 4. Review flashcards

Open the command palette (Ctrl+Shift+P) and pick one of:

| Command | Description |
| --- | --- |
| `Review due flashcards (all due/new)` | Pick a deck (or all), review due + new cards |
| `Cram flashcards (ignore schedule)` | Ignore the algorithm schedule and review anything |
| `Open due note review queue` | Focus the sidebar "Due notes (#review)" |
| `Review current note and rate it` | Rate the open note that carries `#review` |

Select a deck, then rate your ability to recall the current card: press **Space** / "Show answer" to flip, then **`1` Again / `2` Hard / `3` Good / `4` Easy** — each button shows the next interval in days.

### 5. Review whole notes

1. Tag a note `#review` to mark it as reviewable.
2. Run `Open due note review queue` to see which notes are due.
3. Open a note, run `Review current note and rate it` and pick 1~4; the new due date is written into frontmatter `sr-due/sr-interval/sr-ease`.

<br/>

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

# Cloze (each ==…== becomes a separate card; the hidden one shows […], others show as context)
The ==user-space== process calls the ==kernel== through a syscall.
```

Notes (matching OSR): a blank line between `?` and the question/answer truncates the card (degenerate cards with an empty answer are skipped); only half-width `::` `:::` `?` `??` are separators; `::` inside normal text is also recognized as a card (OSR only excludes code fences and inline code `` `a::b` ``); cloze (`==highlight==` by default) is supported and each cloze deletion becomes a reviewable card — one `<!--SR:...-->` comment holds a segment per card side, with unreviewed siblings stored as placeholders. After grading, the comment is written on the line after the card; reversed/cloze cards share one comment with a segment per side. Under FSRS a reviewed segment looks like `!fsrs,2024-05-01T12:00:00.000Z,8,8.2956,1,2,1,0,0,2024-04-23T12:00:00.000Z` (due, scheduled days, stability, difficulty, state, reps, lapses, learning steps, last review); under SM-2 it is `!2024-05-01,8,250`. Unreviewed sibling cards always use the placeholder segment `!2000-01-01,1,250` (same as OSR).

## Deck source (setting `srs.deckSource`)

| Value | Behavior |
| --- | --- |
| `tag` (default, same as OSR) | Only notes with `#flashcards[…/subdeck]` are parsed; deck = tag path |
| `folder` | All notes participate; deck = folder (≈ OSR convertFoldersToDecks) |
| `tagAndFolder` | Only tagged notes are parsed; tag sub-path wins, otherwise the folder |

Tags can be written in the body or in frontmatter `tags`.

## Settings

`Scheduling`: `srs.algorithm` (default `fsrs`; `SM-2-OSR` = obsidian-spaced-repetition's variant of SM-2 — the same literal as its `SRAlgorithmType.SM_2_OSR`) · `srs.fsrsDesiredRetention` (default `0.9`; FSRS retention target between 0.7 and 0.97)
`Parsing & decks`: `srs.language` (default `auto`) · `srs.flashcardTags` (default `["#flashcards"]`) · `srs.noteReviewTags` (default `["#review"]`) · `srs.deckSource` (default `tag`) · `srs.ignoreGlobs` (default excludes .git/.obsidian/.vscode/.agents/.trash/node_modules/.github) · `srs.clozePatterns` (default `["==[123;;]answer[;;hint]=="]`, i.e. `==highlight==` → cloze; empty array disables cloze)
`SM-2 (OSR variant) only`: `srs.baseEase / easyBonus / lapsesIntervalChange / maximumInterval` (used when `srs.algorithm` is `SM-2-OSR`; `maximumInterval` also caps FSRS intervals).

### Scheduling algorithm (`srs.algorithm`)

- `fsrs` (default): new cards are scheduled by [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) with short-term (re)learning steps enabled and the desired retention from `srs.fsrsDesiredRetention`; due-date/interval/stability/difficulty are written in OSR's `<!--SR:!fsrs,...-->` format. Legacy SM-2 comments are migrated to FSRS when their card is next reviewed.
- `SM-2-OSR`: the original SM-2 (OSR variant) scheduler used by classic obsidian-spaced-repetition. FSRS comments are converted back to SM-2 (ease derived from difficulty) when their card is next reviewed.
- Because the algorithm is stored per card in the comment segment itself, the two formats coexist safely in one vault; the setting only decides what happens to a card the next time you rate it.

### UI language (`srs.language`)

`auto` (default) follows the VS Code UI language (starts with `zh` → Simplified Chinese, otherwise English), or you can force `en` or `zh-cn`. Command titles, the activity-bar container and the view name are driven by the VS Code UI language (`package.nls.*`); in-panel runtime text is controlled by `srs.language`.

## Known limitations

- Single-workspace mode; no statistics charts or reminders.
- If a note has unsaved edits while reviewing, the schedule write-back may fail due to text mismatch (save and retry).
- Write-back saves the whole document (unsaved edits are saved too; no content is lost).
- Whole-note (`#review`) reviews stay on SM-2 (OSR variant) in frontmatter `sr-due/sr-interval/sr-ease` — matching obsidian-spaced-repetition, which has no FSRS format for whole-note scheduling yet.
- FSRS due dates are full timestamps (as in OSR), so the due queue becomes live once a card's due instant passes; FSRS (re)learning steps of under a day show up as due on the same day.

## How it stays compatible with OSR

All differences live in the adaptation layer; the upstream body is untouched. Before parsing, non-`<!--SR:` HTML comments are blanked out (the upstream mishandles multi-line HTML comments by deciding on the first line, swallowing subsequent content), degenerate empty-answer cards are not queued, cloze patterns are configurable (default matches OSR's `==…==`) but cloze cards are rendered with a plain-text formatter rather than OSR's inline-HTML spans (to keep the `html:false` render baseline), and SM-2 comment intervals are serialized to whole days with no load-balance fuzzing. The FSRS side mirrors OSR's FSRS integration (same `<!--SR:!fsrs,...-->` segment layout, same ts-fsrs parameter mapping — desired retention + `enable_short_term` — and the same SM-2 ↔ FSRS import helpers); the local implementation is plain-Date based (no moment) and does not write OSR's JSON sidecar data store.

## Links & Resources 🔗

- [Repository](https://github.com/rongbc/vscode-spaced-repetition)
- [Issues](https://github.com/rongbc/vscode-spaced-repetition/issues)
- [obsidian-spaced-repetition (upstream)](https://github.com/st3v3nmw/obsidian-spaced-repetition)
- [FSRS4Anki (algorithm)](https://github.com/open-spaced-repetition/fsrs4anki)
- [ts-fsrs (official TypeScript port used here)](https://github.com/open-spaced-repetition/ts-fsrs)

## Development

```
.vscode/launch.json / tasks.json / settings.json    # F5 debug config
src/lib/      # vendored from OSR v1.15.4: parser.ts / question-type.ts / compat.ts / strings.ts (see THIRD-PARTY-NOTICES.md)
src/core/     # pure logic: dates, model, SM-2 (sm2.ts), FSRS (fsrs.ts on ts-fsrs), algorithm dispatcher (scheduler.ts)
src/parser/   # md utils, flashcard adapter layer (calls the vendored parser), #review frontmatter
src/store/    # comment write-back (text-level)
src/i18n.ts   # en / zh-cn message dictionary with t(key, vars) formatter (display language srs.language)
src/ui/       # Webview review panel (markdown-it + highlight.js + KaTeX), due-note tree, status bar
src/workspace.ts / config.ts / extension.ts
package.nls.json / package.nls.zh-cn.json          # contribution-point title/view localization
test/         # English fixture + smoke tests (upstream parse() parity, SM-2 & FSRS scheduling, write-back round-trips)
```

Scripts: `npm run compile` (tsc) · `npm run smoke` (parse parity / scheduling / write-back round-trip) · `npm run package` (VSIX via `@vscode/vsce`).

### Upstream sync (when maintaining the vendored code)

`src/lib/` comes from OSR v1.15.4. To upgrade: copy the corresponding files in and replace only the import lines (parser/question-type's `CardType`, `SR_METADATA_CALLOUT` and `SRSettings` come from `./compat`, helpers from `./strings`), then run `npm run smoke` and check the "upstream parser consistency" section for regressions. The FSRS layer (`src/core/fsrs.ts`, `src/core/scheduler.ts`) intentionally mirrors the FSRS integration on OSR's `master` (`src/scheduling/algorithms/fsrs/*`) so the on-disk formats stay interchangeable.

## License

- The code developed for this extension is licensed under the [MIT License](LICENSE), Copyright (c) 2026 rong baichuan.
- The vendored third-party code (`src/lib/parser.ts`, `src/lib/question-type.ts`, `src/lib/compat.ts`, `src/lib/strings.ts`) is licensed separately under the upstream MIT License — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- The FSRS scheduling uses the npm dependency [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT, Copyright (c) 2026 Open Spaced Repetition), the official TypeScript port of the [FSRS4Anki](https://github.com/open-spaced-repetition/fsrs4anki) algorithm (MIT, Copyright (c) 2022 open-spaced-repetition) — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
