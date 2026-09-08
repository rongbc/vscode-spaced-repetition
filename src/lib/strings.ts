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
export function findLineIndexOfSearchStringIgnoringWs(
    lines: string[],
    searchString: string,
): number {
    let result: number = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === searchString) {
            result = i;
            break;
        }
    }
    return result;
}
