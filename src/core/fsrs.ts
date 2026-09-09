/*
 * This file mirrors the FSRS scheduling-comment format, ts-fsrs parameter
 * mapping and SM-2 <-> FSRS conversion helpers implemented in
 * obsidian-spaced-repetition (upstream master, src/scheduling/algorithms/fsrs/*).
 *
 * The code here is an independent re-implementation on native JavaScript Date
 * (no moment, no upstream imports) — not vendored source — but where its logic
 * is closely modeled on the upstream implementation, attribution follows:
 *
 * Copyright (c) 2021 - 2024 Stephen Mwangi     (obsidian-spaced-repetition, MIT)
 * Upstream FSRS integration:
 *   https://github.com/st3v3nmw/obsidian-spaced-repetition
 *   (master commit 3d5079f3bcd54531b084040d1c0178f15f681510)
 *
 * The FSRS algorithm itself is consumed through the npm dependency ts-fsrs,
 * the official TypeScript port of the FSRS4Anki algorithm:
 *
 * Copyright (c) 2026 Open Spaced Repetition  (ts-fsrs, MIT)
 *   https://github.com/open-spaced-repetition/ts-fsrs
 * Copyright (c) 2022 open-spaced-repetition  (FSRS4Anki, MIT)
 *   https://github.com/open-spaced-repetition/fsrs4anki
 *
 * Full license texts: THIRD-PARTY-NOTICES.md
 */

// FSRS 调度(纯逻辑,无 vscode 依赖,可单测)。
// 算法本体来自 ts-fsrs(FSRS4Anki 的官方 TypeScript 移植,https://github.com/open-spaced-repetition/ts-fsrs)。
// 注释格式、参数映射与 SM-2 <-> FSRS 转换逻辑镜像 obsidian-spaced-repetition 上游的
// src/scheduling/algorithms/fsrs/*(master 3d5079f,FSRS 为上游实验性特性):
//   - 注释段 !fsrs,{due ISO},{interval},{stability},{difficulty},{state},{reps},{lapses},{learningSteps},{lastReview ISO|-}
//   - 未复习兄弟卡仍写 SM-2 占位 !2000-01-01,1,baseEase(与上游 formatCardSchedule 一致)
//   - 全局算法设为 fsrs 时,旧 SM-2 注释在下次复习时经 sm2ScheduleToFsrsCard 一次性迁移成 FSRS
// 本地差异:不引入 moment / 全局时钟,时间全部用原生 Date,且 now 由调用方注入以便测试。

import { Card, CardInput, FSRSParameters, Grade as FsrsGrade, Rating, State } from "ts-fsrs";
import { createEmptyCard, fsrs } from "ts-fsrs";

import { FsrsSeg, FsrsState, Grade, OsrSeg, SRSConfig } from "./model";
import { dateToMs } from "./dates";

export const FSRS_COMMENT_PREFIX = "fsrs";

/** 与上游 fsrs-helpers 的 LEGACY_MIN_EASE / LEGACY_MAX_EASE 一致 */
const LEGACY_MIN_EASE = 130;
const LEGACY_MAX_EASE = 370;

const DAY_MS = 24 * 3600 * 1000;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** 生成 FSRS 参数(与上游 buildFsrsParameters 一致) */
export function fsrsParams(cfg: SRSConfig): Partial<FSRSParameters> {
    return {
        request_retention: cfg.fsrsDesiredRetention,
        maximum_interval: cfg.maximumInterval,
        enable_short_term: true,
    };
}

/** 本地评级 -> ts-fsrs Rating(与上游 reviewResponseToFsrsGrade 一致) */
export function gradeToFsrsRating(grade: Grade): FsrsGrade {
    switch (grade) {
        case "again":
            return Rating.Again;
        case "hard":
            return Rating.Hard;
        case "good":
            return Rating.Good;
        case "easy":
            return Rating.Easy;
    }
}

/** SM-2 ease(130~370) -> FSRS difficulty(1~10),与上游 easeToDifficulty 一致 */
export function easeToDifficulty(ease: number | null | undefined): number {
    if (ease === null || ease === undefined) return 5.5;
    const clampedEase = clamp(ease, LEGACY_MIN_EASE, LEGACY_MAX_EASE);
    const normalized = (clampedEase - LEGACY_MIN_EASE) / (LEGACY_MAX_EASE - LEGACY_MIN_EASE);
    return clamp(10 - normalized * 9, 1, 10);
}

/** FSRS difficulty(1~10) -> SM-2 ease(130~370),与上游 difficultyToEase 一致(UI 展示用) */
export function difficultyToEase(difficulty: number): number {
    const clamped = clamp(difficulty, 1, 10);
    const normalized = (10 - clamped) / 9;
    return Math.round(LEGACY_MIN_EASE + normalized * (LEGACY_MAX_EASE - LEGACY_MIN_EASE));
}

/** 时间戳序列化:null(无)写作 "-"(与上游 formatFsrsTimestamp 一致) */
export function formatFsrsTs(date: Date | null): string {
    return date ? date.toISOString() : "-";
}

/** 时间戳反序列化:"-" -> null(与上游 parseFsrsTimestamp 一致) */
export function parseFsrsTs(input: string): Date | null {
    if (input === "-" || input === "") return null;
    const ms = Date.parse(input);
    return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * 解析注释内单个 FSRS 段("fsrs,{due},{interval},{stability},{difficulty},{state},{reps},{lapses},{learningSteps},{lastReview}" )。
 * 无法解析(日期非法等)返回 null。字段序与上游 RepItemScheduleInfoFsrs 序列化一致。
 */
export function parseFsrsSegString(text: string): FsrsSeg | null {
    if (!text.startsWith(`${FSRS_COMMENT_PREFIX},`)) return null;
    const fields = text.split(",");
    const [
        _prefix,
        dueStr,
        intervalStr,
        stabilityStr,
        difficultyStr,
        stateStr,
        repsStr,
        lapsesStr,
        learningStepsStr,
        lastReviewStr,
    ] = fields;
    if (!dueStr || !intervalStr || !stabilityStr || !difficultyStr || !stateStr) return null;
    if (!parseFsrsTs(dueStr)) return null;
    return {
        kind: "fsrs",
        due: dueStr,
        interval: Number(intervalStr),
        stability: Number(stabilityStr),
        difficulty: Number(difficultyStr),
        state: Number(stateStr) as FsrsState,
        reps: Number(repsStr ?? 0),
        lapses: Number(lapsesStr ?? 0),
        learningSteps: Number(learningStepsStr ?? 0),
        lastReview: parseFsrsTs(lastReviewStr) ? lastReviewStr : null,
    };
}

/** 序列化单个 FSRS 段("!fsrs,...",与上游 formatScheduleAsSRHtmlComment 一致;时间戳原样往返) */
export function formatFsrsSegString(seg: FsrsSeg): string {
    return (
        `!${FSRS_COMMENT_PREFIX},${seg.due},${seg.interval},${seg.stability},${seg.difficulty},` +
        `${seg.state},${seg.reps},${seg.lapses},${seg.learningSteps},${seg.lastReview ?? "-"}`
    );
}

/** 两个时刻之间的整天数(向下取整,与 moment.diff(..., "days")/ts-fsrs dateDiffInDays 一致) */
export function daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** ts-fsrs Card -> FsrsSeg(与上游 RepItemScheduleInfoFsrs.fromFsrsCard 一致) */
export function fsrsCardToSeg(card: Card): FsrsSeg {
    return {
        kind: "fsrs",
        due: card.due.toISOString(),
        interval: card.scheduled_days,
        stability: card.stability,
        difficulty: card.difficulty,
        state: card.state as FsrsState,
        reps: card.reps,
        lapses: card.lapses,
        learningSteps: card.learning_steps,
        lastReview: card.last_review ? card.last_review.toISOString() : null,
    };
}

/** FsrsSeg -> ts-fsrs CardInput(与上游 RepItemScheduleInfoFsrs.toFsrsCardInput 一致) */
export function fsrsSegToCardInput(seg: FsrsSeg, now: Date): CardInput {
    const lastReview = seg.lastReview ? new Date(seg.lastReview) : now;
    return {
        due: seg.due,
        stability: seg.stability,
        difficulty: seg.difficulty,
        elapsed_days: Math.max(0, daysBetween(lastReview, now)),
        scheduled_days: seg.interval,
        learning_steps: seg.learningSteps,
        reps: seg.reps,
        lapses: seg.lapses,
        state: seg.state,
        last_review: seg.lastReview ? seg.lastReview : null,
    };
}

/**
 * 旧 SM-2(OSR 变体)调度 -> FSRS CardInput(一次性迁移)。
 * 与上游 sm2ScheduleToFsrsCard 一致:以间隔估算 stability,以 ease 换算 difficulty,
 * lastReview 取 due - interval,状态直接置 Review。
 */
export function osrSegToFsrsCardInput(seg: OsrSeg, now: Date): CardInput {
    const interval = Math.max(1, Math.round(seg.interval ?? 1));
    const due = new Date(dateToMs(seg.due));
    const lastReview = new Date(due.getTime() - interval * DAY_MS);
    return {
        due: seg.due,
        stability: Math.max(0.1, interval),
        difficulty: easeToDifficulty(seg.ease),
        elapsed_days: Math.max(0, daysBetween(lastReview, now)),
        scheduled_days: interval,
        learning_steps: 0,
        reps: Math.max(1, Math.round(Math.log2(interval + 1))),
        lapses: 0,
        state: State.Review,
        last_review: lastReview,
    };
}

/** 新卡首次评级 -> FSRS 调度(与上游 SrsAlgorithmFsrs.cardGetNewSchedule 一致) */
export function newCardFsrs(grade: Grade, cfg: SRSConfig, now: Date = new Date()): FsrsSeg {
    const scheduler = fsrs(fsrsParams(cfg));
    const record = scheduler.next(createEmptyCard(now), now, gradeToFsrsRating(grade));
    return fsrsCardToSeg(record.card);
}

/**
 * 复习已有卡(段可为 FSRS 或旧 SM-2;后者先迁移为 FSRS 再调度,与上游
 * SrsAlgorithmFsrs.cardCalcUpdatedSchedule / RepItemScheduleFactory 一致)。
 */
export function reviewCardFsrs(
    grade: Grade,
    cur: FsrsSeg | OsrSeg,
    cfg: SRSConfig,
    now: Date = new Date(),
): FsrsSeg {
    const card: CardInput =
        cur.kind === "fsrs" ? fsrsSegToCardInput(cur, now) : osrSegToFsrsCardInput(cur, now);
    const scheduler = fsrs(fsrsParams(cfg));
    const record = scheduler.next(card, now, gradeToFsrsRating(grade));
    return fsrsCardToSeg(record.card);
}

/** ISO 8601 -> 本地时区 YYYY-MM-DD(显示/到期日比较用) */
export function isoToLocalDay(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (x: number) => (x < 10 ? `0${x}` : String(x));
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
