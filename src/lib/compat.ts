/*
 * This file is derived from obsidian-spaced-repetition v1.15.4.
 *
 * Copyright (c) 2021 - 2024 Stephen Mwangi
 *
 * The original source is licensed under the MIT License.
 * See THIRD-PARTY-NOTICES.md for the full license text.
 *
 * Upstream:
 * https://github.com/st3v3nmw/obsidian-spaced-repetition/tree/1.15.4
 * (commit 0f81fc147bc80781f110fe0f7a9a05145d74c581)
 */
// 本文件是上游类型/常量的最小兼容子集:仅为让 parser.ts / question-type.ts 原样编译运行。
// 各定义与原仓库保持一致,勿按个人喜好改动。

/** 与原仓库 src/data/data-structures/card/questions/question.ts 的 CardType 完全一致 */
export enum CardType {
    SingleLineBasic,
    SingleLineReversed,
    MultiLineBasic,
    MultiLineReversed,
    Cloze,
}

/** 与原仓库 src/data/constants.ts 一致 */
export const SR_METADATA_CALLOUT = "> [!sr|card-metadata]";

/**
 * 仅含 question-type.ts / parser.ts 用到的设置字段(字段名与原仓库 SRSettings 对应字段一致)。
 * 原仓库 SRSettings 字段更多,这里取子集即可让 vendor 代码原样编译。
 */
export interface SRSettings {
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    multilineCardEndMarker: string;
    convertClozePatternsToInputs: boolean;
    clozePatterns: string[];
}
