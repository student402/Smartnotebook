export function getPlainTextPreview(content, t) {
  if (!content) return "";

  const hasImage = /!\[[^\]]*\]\(([^)]+)\)/.test(content);

  let text = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/_([^_]*)_/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\[(?: |x|X)\]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^---*\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text && hasImage) return t.imageOnlyPreview;
  if (text.length > 100) text = text.substring(0, 100) + "...";
  return text;
}

// Returns array of {type, text} blocks for rich card preview
export function getRichPreview(content, t, maxChars = 120) {
  if (!content) return [];

  const lines = content.split("\n");
  const blocks = [];
  let charCount = 0;

  for (let i = 0; i < lines.length && charCount < maxChars; i++) {
    const line = lines[i].trimEnd();
    if (!line) continue;

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const text = headingMatch[2]
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\*([^*]*)\*/g, "$1");
      blocks.push({ type: "heading", level: headingMatch[1].length, text });
      charCount += text.length;
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s+(.+)/);
    if (quoteMatch) {
      const text = quoteMatch[1];
      blocks.push({ type: "quote", text });
      charCount += text.length;
      continue;
    }

    // Code block start — skip until end
    if (line.startsWith("```")) {
      blocks.push({ type: "code" });
      charCount += 6;
      while (i + 1 < lines.length && !lines[i + 1].startsWith("```")) i++;
      i++; // skip closing ```
      continue;
    }

    // Checklist
    const checkMatch = line.match(/^\[(x|X| )\]\s+(.+)/i);
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === "x";
      const text = checkMatch[2];
      blocks.push({ type: "check", checked, text });
      charCount += text.length;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      const text = ulMatch[1]
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\*([^*]*)\*/g, "$1");
      blocks.push({ type: "bullet", text });
      charCount += text.length;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      const text = olMatch[1]
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\*([^*]*)\*/g, "$1");
      blocks.push({ type: "numbered", text });
      charCount += text.length;
      continue;
    }

    // Image
    if (/!\[[^\]]*\]\([^)]*\)/.test(line)) {
      blocks.push({ type: "image" });
      charCount += 6;
      continue;
    }

    // Table row (skip, just mark table)
    if (line.startsWith("|")) {
      if (!blocks.find((b) => b.type === "table")) {
        blocks.push({ type: "table" });
        charCount += 6;
      }
      continue;
    }

    // Plain paragraph — apply inline formatting markers
    let text = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]*)\*\*/g, "$1")
      .replace(/\*([^*]*)\*/g, "$1")
      .replace(/__([^_]*)__/g, "$1")
      .replace(/_([^_]*)_/g, "$1")
      .replace(/`[^`]*`/g, (m) => m.slice(1, -1))
      .trim();

    if (text) {
      // detect inline bold/italic/code presence in original
      const hasBold = /\*\*[^*]+\*\*/.test(line) || /__[^_]+__/.test(line);
      const hasItalic =
        /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/.test(line) ||
        /(?<!_)_(?!_)([^_]+)_(?!_)/.test(line);
      const hasCode = /`[^`]+`/.test(line);
      blocks.push({ type: "text", text, hasBold, hasItalic, hasCode });
      charCount += text.length;
    }
  }

  // Trim to maxChars and add ellipsis on last text block
  if (charCount >= maxChars) {
    const last = blocks[blocks.length - 1];
    if (last && last.text && last.text.length > 20) {
      last.text = last.text.substring(0, 80) + "…";
    }
  }

  return blocks.slice(0, 6); // max 6 blocks
}
