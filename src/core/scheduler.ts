/*
 * Scheduling dispatcher: picks FSRS or SM-2 (OSR variant) per srs.algorithm
 * and the card's existing schedule segment.
 *
 * The dispatch and migration semantics (a legacy SM-2 schedule is imported into
 * FSRS on its next review when FSRS is active, and an FSRS schedule is written
 * back as SM-2 when the OSR algorithm is active) intentionally mirror the
 * behavior implemented in obsidian-spaced-repetition (upstream master,
 * src/data/data-manager.ts, src/scheduling/algorithms/base/rep-item-info-factory.ts,
 * src/scheduling/algorithms/fsrs/sr-algorithm-fsrs.ts). The conversion helpers
 * themselves live in ./fsrs.ts, whose file header carries the full attribution:
 *
 * Copyright (c) 2021 - 2024 Stephen Mwangi     (obsidian-spaced-repetition, MIT)
 *   https://github.com/st3v3nmw/obsidian-spaced-repetition
 *   (master commit 3d5079f3bcd54531b084040d1c0178f15f681510)
 *
 * The rest of this file (due-day helpers, interval display) is original
 * adaptation-layer code of this extension. Full license texts:
 * THIRD-PARTY-NOTICES.md
 */

// 调度分派:按配置算法(srs.algorithm)与卡片既有分段类型,选择 FSRS 或 SM-2(OSR 变体)。
// 语义与 obsidian-spaced-repetition 上游一致(算法归属与完整许可声明见 fsrs.ts 文件头及 THIRD-PARTY-NOTICES.md):
//   - 算法 = fsrs(默认):新卡走 FSRS;FSRS 段原样续算;旧 SM-2 段先迁移为 FSRS 再算(一次性改写)。
//   - 算法 = SM-2-OSR:新卡走 SM-2;SM-2 段原样续算;FSRS 段先换算回 SM-2(ease = difficultyToEase)再算。
// 段到期判定:OSR 段按 YYYY-MM-DD(本地日粒度,与旧行为一致);FSRS 段按 ISO 时间戳(与 OSR 一致)。

import { FsrsSeg, Grade, OsrSeg, SchedSeg, SRSConfig } from "./model";
import { todayStr, humanizeInterval } from "./dates";
import { newCardSchedule, reviewCardSchedule } from "./sm2";
import { difficultyToEase, isoToLocalDay } from "./fsrs";
import { newCardFsrs, reviewCardFsrs } from "./fsrs";

export type Lang = "en" | "zh-cn";

/**
 * 计算一次评级后的新调度分段。
 * @param grade 评级
 * @param cur   当前分段;null = 该侧从未复习(新卡)
 * @param cfg
 * @param now   当前时刻(FSRS 用;默认取调用时刻,测试可注入固定时间)
 */
export function calcNextSeg(
    grade: Grade,
    cur: SchedSeg | null,
    cfg: SRSConfig,
    now: Date = new Date(),
): SchedSeg {
    if (cfg.algorithm === "fsrs") {
        // 旧 SM-2 段经 osrSegToFsrsCardInput 自动迁移为 FSRS(与上游 RepItemScheduleFactory 一致)
        return cur === null ? newCardFsrs(grade, cfg, now) : reviewCardFsrs(grade, cur, cfg, now);
    }
    const osrCur: OsrSeg | null =
        cur === null ? null : cur.kind === "osr" ? cur : fsrsToOsrSeg(cur);
    const s = osrCur ? reviewCardSchedule(grade, osrCur, cfg) : newCardSchedule(grade, cfg);
    return { kind: "osr", due: s.due, interval: s.interval, ease: s.ease };
}

/** FSRS 段 -> OSR 段表示(interval/due 原样,ease = difficultyToEase;与上游 fsrs->osr 分支一致) */
export function fsrsToOsrSeg(seg: FsrsSeg): OsrSeg {
    return {
        kind: "osr",
        due: isoToLocalDay(seg.due),
        interval: seg.interval,
        ease: difficultyToEase(seg.difficulty),
    };
}

/** 分段到期日(YYYY-MM-DD,本地日历;OSR 段即其日期,FSRS 段换算本地日) */
export function segDueDay(seg: SchedSeg): string {
    return seg.kind === "osr" ? seg.due : isoToLocalDay(seg.due);
}

/**
 * 分段是否到期。
 * OSR 段:到期日 <= 今天(本地日粒度,保持旧行为);FSRS 段:due 时间戳 <= now(与 OSR 一致)。
 */
export function isSegDue(seg: SchedSeg, now: Date = new Date()): boolean {
    if (seg.kind === "osr") return seg.due <= todayStr();
    const ms = Date.parse(seg.due);
    return !Number.isNaN(ms) && ms <= now.getTime();
}

/** 分段展示用 ease:OSR 段原值;FSRS 段换算 difficulty -> ease(与 OSR UI 的 latestEase 语义一致) */
export function segEaseDisplay(seg: SchedSeg): number {
    return seg.kind === "osr" ? seg.ease : difficultyToEase(seg.difficulty);
}

/** 分段间隔的天数展示值(学习步进等 <1 天的短间隔也按天取整为 0) */
export function segIntervalDays(seg: SchedSeg): number {
    return Math.max(0, Math.round(seg.interval));
}

/**
 * 间隔人类可读文案:<1 天的 FSRS 学习步进按距 due 的分钟/小时显示(与 OSR 的短间隔展示近似),
 * 其余显示为 "N days / N天"。
 */
export function humanizeSegInterval(seg: SchedSeg, lang: Lang = "en"): string {
    const days = segIntervalDays(seg);
    if (days >= 1) return humanizeInterval(days, lang);
    if (seg.kind === "fsrs") {
        const ms = Date.parse(seg.due);
        if (!Number.isNaN(ms)) {
            const mins = Math.max(1, Math.ceil((ms - Date.now()) / 60000));
            if (mins < 60) return lang === "zh-cn" ? `${mins} 分钟` : `${mins} min`;
            const hrs = Math.ceil(mins / 60);
            return lang === "zh-cn" ? `${hrs} 小时` : `${hrs} hr`;
        }
    }
    return humanizeInterval(0, lang);
}
