import { Icon } from "../Icon";
import { formatDate } from "../../lib/utils/date";
import { getRichPreview } from "../../lib/utils/preview";
import { getTagColor } from "../../lib/utils/tagColor";

function TagRow({ tags, theme, max = 3 }) {
  const visible = tags.slice(0, max);
  const rest = tags.length - max;
  return (
    <div className="note-tags-row compact">
      {visible.map((tag) => {
        const [background, color] = getTagColor(tag, theme);
        return (
          <span key={tag} className="tag-badge" style={{ background, color }}>
            <Icon name="tag" size={10} />
            <span className="tag-chip-text" title={tag}>
              {tag}
            </span>
          </span>
        );
      })}
      {rest > 0 && <span className="tag-badge tag-badge--more">+{rest}</span>}
    </div>
  );
}

function RichPreviewBlock({ block }) {
  switch (block.type) {
    case "heading":
      return (
        <span className="rp-heading">
          <span className="rp-heading-marker">H{block.level}</span>
          {block.text}
        </span>
      );
    case "quote":
      return (
        <span className="rp-quote">
          <span className="rp-quote-bar" />
          {block.text}
        </span>
      );
    case "code":
      return <span className="rp-badge rp-badge--code">{"{ }"} code</span>;
    case "check":
      return (
        <span className="rp-check">
          <span className={"rp-checkbox" + (block.checked ? " checked" : "")}>
            {block.checked ? "✓" : ""}
          </span>
          <span className={block.checked ? "rp-check-done" : ""}>
            {block.text}
          </span>
        </span>
      );
    case "bullet":
      return (
        <span className="rp-bullet">
          <span className="rp-bullet-dot" />
          {block.text}
        </span>
      );
    case "numbered":
      return (
        <span className="rp-bullet">
          <span className="rp-numbered-dot">·</span>
          {block.text}
        </span>
      );
    case "image":
      return <span className="rp-badge rp-badge--media">⬜ image</span>;
    case "table":
      return <span className="rp-badge rp-badge--table">⊞ table</span>;
    case "text":
      return (
        <span className="rp-text">
          {block.hasBold && <span className="rp-inline-badge rp-bold">B</span>}
          {block.hasItalic && (
            <span className="rp-inline-badge rp-italic">I</span>
          )}
          {block.hasCode && (
            <span className="rp-inline-badge rp-code">{"<>"}</span>
          )}
          {block.text}
        </span>
      );
    default:
      return null;
  }
}

export function NotesGridContent({ notes, onSelectNote, t, language, theme }) {
  return (
    <div className="notes-main-list">
      <div className="notes-grid">
        {notes.map((note) => {
          const preview = getRichPreview(note.content, t);
          return (
            <button
              key={note.id}
              type="button"
              className="grid-card"
              onClick={() => onSelectNote(note.id)}
            >
              <div className="grid-card-title">{note.title}</div>
              <div className="rp-list rp-list--grid">
                {preview.length > 0 ? (
                  preview.map((block, i) => (
                    <RichPreviewBlock key={i} block={block} />
                  ))
                ) : (
                  <span className="rp-empty">{t.noteEmpty}</span>
                )}
              </div>
              <div className="grid-card-footer">
                <TagRow tags={note.tags} theme={theme} max={3} />
                <span className="grid-card-date">
                  {formatDate(note.updated_at || note.created_at, language)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
