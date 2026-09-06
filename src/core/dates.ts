// 日期工具:全部基于本地时区的 YYYY-MM-DD 字符串(与 OSR 的 PREFERRED_DATE_FORMAT 一致)。

export const DUMMY_DUE = "2000-01-01"; // OSR 中未复习卡的占位日期

const DAY_MS = 24 * 3600 * 1000;

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/** 今天(本地时区)YYYY-MM-DD */
export function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD -> 自 epoch 毫秒(按 UTC 解析,避免 DST 抖动) */
export function dateToMs(dateStr: string): number {
    return Date.parse(`${dateStr}T00:00:00Z`);
}

/** 在 dateStr(YYYY-MM-DD)上加减整数天,返回 YYYY-MM-DD(本地日历) */
export function addDays(dateStr: string, days: number): string {
    const ms = dateToMs(dateStr);
    const d = new Date(ms + days * DAY_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 今天相对 due(YYYY-MM-DD)逾期了多少整天;未到期/当天为 0(与 OSR delayedBeforeReview 语义一致) */
export function overdueDays(due: string): number {
    return Math.max(0, Math.floor((dateToMs(todayStr()) - dateToMs(due)) / DAY_MS));
}

/** 到期判断:due <= 今天(字典序比较对 YYYY-MM-DD 即时间序) */
export function isDue(due: string): boolean {
    return due <= todayStr();
}

/** 人类可读的间隔描述,如 "2个月"、"3天" */
export function humanizeInterval(days: number): string {
    const m = Math.round(days / 30.4375);
    const y = Math.round(days / 365.25);
    if (m < 1) return `${days}天`;
    if (y < 1) return `${m}个月`;
    return `${y}年`;
}
