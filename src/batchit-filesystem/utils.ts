export function addLineNumbers(content: string, startLine: number = 1): string {
    const lines = content.split("\n")
    const maxLineNumberWidth = String(startLine + lines.length - 1).length
    return lines
        .map((line, index) => {
            const lineNumber = String(startLine + index).padStart(maxLineNumberWidth, " ")
            return `${lineNumber} | ${line}`
        })
        .join("\n")
}

export function addLineNumbersToBatch(
    contents: Record<string, string>,
    startLine: number = 1
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(contents)) {
        result[key] = addLineNumbers(value, startLine);
    }
    return result;
}
