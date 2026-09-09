// 纯数据模型 + 配置结构(无 vscode 依赖,便于单测)。

/** 答题评级,与 OSR 的 ReviewResponse 对应 */
export type Grade = "again" | "hard" | "good" | "easy";

/** 闪卡调度算法:fsrs = FSRS(默认);SM-2-OSR = OSR 变体的 SM-2(字面量与 obsidian-spaced-repetition 上游 SRAlgorithmType.SM_2_OSR 一致) */
export type Algorithm = "fsrs" | "SM-2-OSR";

export interface SRSConfig {
    algorithm: Algorithm;
    flashcardTags: string[];
    noteReviewTags: string[];
    deckSource: "folder" | "tag" | "tagAndFolder";
    ignoreGlobs: string[];
    /** 挖空卡(cloze)匹配模式。传空数组则关闭 cloze。默认与 OSR 一致:==高亮== 视为挖空 */
    clozePatterns: string[];
    baseEase: number;
    easyBonus: number;
    lapsesIntervalChange: number;
    maximumInterval: number;
    /** FSRS 期望保留率(0.7~0.97,默认 0.9,与 FSRS4Anki / OSR 一致) */
    fsrsDesiredRetention: number;
}

export const DEFAULT_CONFIG: SRSConfig = {
    algorithm: "fsrs",
    flashcardTags: ["#flashcards"],
    noteReviewTags: ["#review"],
    // 与 OSR 默认一致:仅解析带闪卡标签的笔记,牌组 = 标签路径
    deckSource: "tag",
    ignoreGlobs: [
        "**/.git/**",
        "**/.obsidian/**",
        "**/.vscode/**",
        "**/.agents/**",
        "**/.trash/**",
        "**/node_modules/**",
        "**/.github/**",
    ],
    // OSR 默认 cloze 模式:==高亮== 视为挖空(convertHighlightsToClozes 默认开启)
    clozePatterns: ["==[123;;]answer[;;hint]=="],
    baseEase: 250,
    easyBonus: 1.3,
    lapsesIntervalChange: 0.5,
    maximumInterval: 36525,
    fsrsDesiredRetention: 0.9,
};

/** 一张卡(可答题单元)的正面/背面 */
export interface CardSide {
    front: string;
    back: string;
}

/**
 * 调度分段:一张可答题卡写回注释里的调度数据(kind 判别其算法与注释格式)。
 * 一个闪卡块的调度注释可混合多段,如 <!--SR:!fsrs,...!2000-01-01,1,250-->。
 */
export interface OsrSeg {
    kind: "osr"; // SM-2(OSR 变体):注释段 !日期,间隔,难度
    due: string; // YYYY-MM-DD
    interval: number; // 天(整数,序列化时取整,与 OSR 注释格式兼容)
    ease: number;
}

/** FSRS 状态(ts-fsrs State):New=0 / Learning=1 / Review=2 / Relearning=3 */
export type FsrsState = 0 | 1 | 2 | 3;

/**
 * FSRS 分段,字段与 obsidian-spaced-repetition 的 RepItemScheduleInfoFsrs 序列化一致:
 * !fsrs,{due ISO},{interval},{stability},{difficulty},{state},{reps},{lapses},{learningSteps},{lastReview ISO|-}
 */
export interface FsrsSeg {
    kind: "fsrs";
    due: string; // ISO 8601(注释原样往返)
    interval: number; // scheduled_days(天,可为小数;学习步进为 0)
    stability: number;
    difficulty: number;
    state: FsrsState;
    reps: number;
    lapses: number;
    learningSteps: number;
    lastReview: string | null; // ISO 8601;null 在注释中写作 "-"
}

export type SchedSeg = OsrSeg | FsrsSeg;

/** 解析出的一个闪卡块(一个问题文本,含 1~2 张可答题卡) */
export interface FlashcardBlock {
    relPath: string; // 相对工作区的路径,如 "nuttx/01-架构与构建/构建系统.md"
    deck: string; // 所属牌组(斜杠分隔路径)
    deckByTag: boolean;
    context: string[]; // 标题上下文,如 ["H1 构建模式"]
    reversed: boolean; // 是否反转(::: / 多行 ??)
    sides: CardSide[]; // 1~N 个;N 张可答题卡(反转=2,挖空=每个挖空各一卡)
    /** 去掉调度注释后的原文行(含行首缩进等原始空白;行尾行内注释已被剥离) */
    contentLines: string[];
    /** 旧注释是否独占卡片后一行(否则为行尾行内注释或不存在) */
    commentOnNextLine: boolean;
    /** 调度注释内文(不含 <!-- 与 -->),无则 null,如 "!2024-01-02,3,250" */
    comment: string | null;
    /** 每张可答题卡的调度分段;从未写过注释时整体为 null */
    segs: (SchedSeg | null)[];
    /** 块起始行号(0 基,全文含 frontmatter) */
    line: number;
    /** 块结束行号(0 基,含被吸收的调度注释行),写回时整段替换 */
    endLine: number;
}

export interface DueBlock {
    block: FlashcardBlock;
    sideIdx: number;
    isNew: boolean; // 该侧从未复习
    sched: SchedSeg | null; // 该侧当前调度
    ordinal: number; // 该块在其笔记 parseFlashcards 结果中的序号(写回定位)
}

/** 整篇笔记复习项(#review 标签笔记) */
export interface NoteReviewItem {
    relPath: string;
    /** 是否含复习标签 */
    tagged: boolean;
    due: string | null; // null = 从未复习(新)
    interval: number | null;
    ease: number | null;
}
