import { Fragment } from "react";
import { renderInlineMarkdown } from "./inline.jsx";
import { parseChecklistLine } from "./checklist";
import { getStandaloneLinkData } from "./links";
import { normalizeCodeLanguage, renderHighlightedCode } from "./highlight.jsx";
import { isTableSeparator, splitTableRow } from "./table";
import { LinkPreviewCard } from "../../components/media/LinkPreviewCard";
import { YouTubePreview } from "../../components/media/YouTubePreview";

export function renderMarkdown(content, options = {}) {
  if (!content?.trim()) {
    return null;
  }

  const {
    onToggleChecklist,
    onAppendTableRow,
    onAppendTableColumn,
    readOnlyChecklist = true,
    t,
  } = options;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  const isBullet = (line) => /^[-*]\s+/.test(line);
  const isChecklist = (line) => Boolean(parseChecklistLine(line));
  const isOrdered = (line) => /^\d+\.\s+/.test(line);
  const isQuote = (line) => /^>\s?/.test(line);
  const isHeading = (line) => /^#{1,6}\s+/.test(line);
  const isFence = (line) => /^```/.test(line);
  const isHr = (line) => /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
  const isTableStart = (line, nextLine = "") =>
    line.includes("|") && isTableSeparator(nextLine);
  const isBlockBoundary = (line, nextLine = "") =>
    !line.trim() ||
    isFence(line) ||
    isHeading(line) ||
    isChecklist(line) ||
    isBullet(line) ||
    isOrdered(line) ||
    isQuote(line) ||
    isHr(line) ||
    isTableStart(line, nextLine);

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const standaloneLink = getStandaloneLinkData(line);
    if (standaloneLink?.type === "image") {
      blocks.push(
        <figure key={`image-${blocks.length}`} className="note-media-block">
          <img
            src={standaloneLink.url}
            alt={standaloneLink.alt || ""}
            className="note-block-image"
            loading="lazy"
          />
          {standaloneLink.alt ? (
            <figcaption>{standaloneLink.alt}</figcaption>
          ) : null}
        </figure>,
      );
      index += 1;
      continue;
    }

    if (standaloneLink?.type === "youtube") {
      blocks.push(
        <div key={`youtube-${blocks.length}`} className="note-media-block">
          <YouTubePreview
            url={standaloneLink.url}
            label={standaloneLink.label}
            t={t}
          />
        </div>,
      );
      index += 1;
      continue;
    }

    if (standaloneLink?.type === "link") {
      blocks.push(
        <div key={`link-${blocks.length}`} className="note-media-block">
          <LinkPreviewCard
            url={standaloneLink.url}
            label={standaloneLink.label}
            t={t}
          />
        </div>,
      );
      index += 1;
      continue;
    }

    if (isHr(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="note-hr" />);
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const language = line.replace(/^```/, "").trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre key={`code-${blocks.length}`}>
          <code data-language={language || undefined}>
            {renderHighlightedCode(codeLines.join("\n"), language)}
          </code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const TagName = `h${level}`;
      blocks.push(
        <TagName key={`heading-${blocks.length}`}>
          {renderInlineMarkdown(headingMatch[2], `heading-${blocks.length}`)}
        </TagName>,
      );
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && isTableStart(line, lines[index + 1])) {
      const tableStartIndex = index;
      const header = splitTableRow(line);
      const rows = [];
      index += 2;

      while (
        index < lines.length &&
        lines[index].trim() &&
        lines[index].includes("|")
      ) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      blocks.push(
        <div key={`table-${blocks.length}`} className="note-table-block">
          {onAppendTableRow || onAppendTableColumn ? (
            <div className="note-table-tools">
              {onAppendTableRow ? (
                <button
                  type="button"
                  className="note-table-tool"
                  onClick={() => onAppendTableRow(tableStartIndex)}
                >
                  <span className="note-table-tool-plus">+</span>
                  Row
                </button>
              ) : null}
              {onAppendTableColumn ? (
                <button
                  type="button"
                  className="note-table-tool"
                  onClick={() => onAppendTableColumn(tableStartIndex)}
                >
                  <span className="note-table-tool-plus">+</span>
                  Column
                </button>
              ) : null}
            </div>
          ) : null}
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={`head-${cellIndex}`}>
                    {renderInlineMarkdown(
                      cell,
                      `th-${blocks.length}-${cellIndex}`,
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {header.map((_, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`}>
                      {renderInlineMarkdown(
                        row[cellIndex] || "",
                        `td-${blocks.length}-${rowIndex}-${cellIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (isChecklist(line)) {
      const items = [];

      while (index < lines.length && isChecklist(lines[index])) {
        const parsedChecklist = parseChecklistLine(lines[index]);
        items.push({
          checked: parsedChecklist?.checked || false,
          text: parsedChecklist?.text || "",
          lineIndex: index,
        });
        index += 1;
      }

      blocks.push(
        <ul key={`check-${blocks.length}`} className="note-markdown-checklist">
          {items.map((item, itemIndex) => (
            <li key={`check-item-${itemIndex}`}>
              <input
                type="checkbox"
                className="note-markdown-checkbox"
                checked={item.checked}
                disabled={readOnlyChecklist && !onToggleChecklist}
                onChange={() =>
                  onToggleChecklist?.(item.lineIndex, !item.checked)
                }
              />
              <span>
                {renderInlineMarkdown(
                  item.text,
                  `check-${blocks.length}-${itemIndex}`,
                )}
              </span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (isBullet(line)) {
      const items = [];
      while (
        index < lines.length &&
        isBullet(lines[index]) &&
        !isChecklist(lines[index])
      ) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>
              {renderInlineMarkdown(item, `ul-${blocks.length}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (isOrdered(line)) {
      const items = [];
      while (index < lines.length && isOrdered(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>
              {renderInlineMarkdown(item, `ol-${blocks.length}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (isQuote(line)) {
      const quoteLines = [];
      while (index < lines.length && isQuote(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {renderInlineMarkdown(quoteLines.join(" "), `quote-${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      !isBlockBoundary(lines[index], lines[index + 1] || "")
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <Fragment key={`p-${blocks.length}-${lineIndex}`}>
            {lineIndex > 0 ? <br /> : null}
            {renderInlineMarkdown(
              paragraphLine,
              `p-${blocks.length}-${lineIndex}`,
            )}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}
