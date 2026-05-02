const CHECKLIST_ITEM_REGEX = /^((?:[-*]\s+)?)\[( |x|X)\]\s+(.*)$/;

export function parseChecklistLine(line) {
  const match = line.match(CHECKLIST_ITEM_REGEX);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1] || "",
    checked: match[2].toLowerCase() === "x",
    text: match[3] || "",
  };
}
