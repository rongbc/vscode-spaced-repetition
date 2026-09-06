// SM-2(OSR 变体)调度算法。
// 移植自 obsidian-spaced-repetition 的 src/scheduling/algorithms/osr/note-scheduling.ts
// (去掉了 loadBalance 模糊化;间隔序列化时取整以便与 OSR 的 <!--SR:!...--> 整数注释互读)。

import { SRSConfig, Grade } from "./model";
import { addDays, overdueDays, todayStr } from "./dates";

export interface ScheduleState {
    due: string; // YYYY-MM-DD
    interval: number; // 天
    ease: number;
}

export interface ScheduleCalc {
    interval: number;
    ease: number;
}

/**
 * 核心 SM-2 公式(与 OSR osrSchedule 一致)。
 * @param delayDays 逾期天数(未逾期为 0),仅在已有调度复习时 > 0
 */
export function osrSchedule(
    grade: Grade,
    originalInterval: number,
    ease: number,
    delayDays: number,
    cfg: SRSConfig,
): ScheduleCalc {
    // 保证间隔至少为 1,否则后续公式会错(Again 除外,由下面显式置 0)
    let interval = Math.max(1, originalInterval);

    if (grade === "easy") {
        ease += 20;
        interval = ((interval + delayDays) * ease) / 100;
        interval *= cfg.easyBonus;
    } else if (grade === "good") {
        interval = ((interval + delayDays / 2) * ease) / 100;
    } else if (grade === "hard") {
        ease = Math.max(130, ease - 20);
        interval = Math.max(1, (interval + delayDays / 4) * cfg.lapsesIntervalChange);
    } else if (grade === "again") {
        ease = Math.max(130, ease - 20);
        interval = 0;
    }

    interval = Math.min(interval, cfg.maximumInterval);
    interval = Math.round(interval * 10) / 10;
    return { interval, ease };
}

/** 新卡首次答题后的调度 */
export function newCardSchedule(grade: Grade, cfg: SRSConfig): ScheduleState {
    const calc = osrSchedule(grade, 1, cfg.baseEase, 0, cfg);
    return finalize(cfg, calc);
}

/** 复习已有卡后的调度 */
export function reviewCardSchedule(
    grade: Grade,
    cur: ScheduleState,
    cfg: SRSConfig,
): ScheduleState {
    const delayDays = overdueDays(cur.due);
    const calc = osrSchedule(grade, cur.interval, cur.ease, delayDays, cfg);
    return finalize(cfg, calc);
}

/** 依据今天计算 due 并把序列化间隔取整(与注释格式整数兼容) */
function finalize(cfg: SRSConfig, calc: ScheduleCalc): ScheduleState {
    const interval = Math.max(0, Math.round(calc.interval));
    // due = today + interval
    const today = todayStr();
    return { due: addDays(today, interval), interval, ease: Math.round(calc.ease) };
}
