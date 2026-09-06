// vendor 自 obsidian-spaced-repetition(v1.15.4, https://github.com/st3v3nmw/obsidian-spaced-repetition)
// 的最小兼容类型/常量:让 lib/parser.ts、lib/question-type.ts 可原样编译运行。
// 这些定义与原仓库保持一致,勿按个人喜好改动。

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
