// vendor 自 obsidian-spaced-repetition v1.15.4 (src/utils/strings.ts),正文未改。
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
