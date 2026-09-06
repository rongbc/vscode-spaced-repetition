// 从 VS Code 配置读取运行时配置(缺省与 package.json defaults 对应)。

import * as vscode from "vscode";
import { DEFAULT_CONFIG, SRSConfig } from "./core/model";

function num(v: unknown, dflt: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function strs(v: unknown, dflt: string[]): string[] {
    return Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0
        ? (v as string[])
        : dflt;
}

export function readConfig(): SRSConfig {
    const c = vscode.workspace.getConfiguration("srs");
    const deckSourceRaw = c.get<string>("deckSource", DEFAULT_CONFIG.deckSource);
    const deckSource: SRSConfig["deckSource"] =
        deckSourceRaw === "tag" || deckSourceRaw === "tagAndFolder"
            ? deckSourceRaw
            : "folder";
    return {
        flashcardTags: strs(c.get("flashcardTags"), DEFAULT_CONFIG.flashcardTags),
        noteReviewTags: strs(c.get("noteReviewTags"), DEFAULT_CONFIG.noteReviewTags),
        deckSource,
        ignoreGlobs: strs(c.get("ignoreGlobs"), DEFAULT_CONFIG.ignoreGlobs),
        baseEase: num(c.get("baseEase"), DEFAULT_CONFIG.baseEase),
        easyBonus: num(c.get("easyBonus"), DEFAULT_CONFIG.easyBonus),
        lapsesIntervalChange: num(c.get("lapsesIntervalChange"), DEFAULT_CONFIG.lapsesIntervalChange),
        maximumInterval: num(c.get("maximumInterval"), DEFAULT_CONFIG.maximumInterval),
    };
}
