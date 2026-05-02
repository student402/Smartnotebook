export function isTableSeparator(line) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

export function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function formatTableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

export function findMarkdownTableStartLine(lines, lineIndex) {
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return null;
  }

  let currentLine = lineIndex;
  while (currentLine >= 0 && lines[currentLine].trim() && lines[currentLine].includes("|")) {
    if (currentLine + 1 < lines.length && isTableSeparator(lines[currentLine + 1])) {
      return currentLine;
    }
    currentLine -= 1;
  }

  return null;
}
