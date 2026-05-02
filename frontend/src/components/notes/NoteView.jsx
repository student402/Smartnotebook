import { Icon } from "../Icon";
import { renderMarkdown } from "../../lib/markdown/render.jsx";
import { formatDate } from "../../lib/utils/date";
import { getTagColor } from "../../lib/utils/tagColor";

export function NoteView({ note, recommendations, onSelectNote, onToggleChecklist, t, language, theme, contentRef }) {
  return (
    <div className="note-view">
      <div className="note-view-header">
        <div>
          <h2 className="note-title-display">{note.title}</h2>
          {note.tags.length > 0 && (
            <div className="note-tags-row">
              {note.tags.map((tag) => {
                const [background, color] = getTagColor(tag, theme);

                return (
                  <span key={tag} className="tag-badge" style={{ background, color }}>
                    <Icon name="tag" size={10} />
                    <span className="tag-chip-text" title={tag}>{tag}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="topbar-meta">{formatDate(note.updated_at || note.created_at, language)}</div>
      </div>

      <hr className="note-divider" />
      <div ref={contentRef} className="note-body note-markdown">
        {renderMarkdown(note.content, { onToggleChecklist, readOnlyChecklist: false, t }) || <span style={{ color: "var(--text-muted)" }}>{t.noteEmpty}</span>}
      </div>
      <div className="recommendations">
        <h4>
          <Icon name="sparkle" size={16} /> {t.recommendations}
        </h4>
        {recommendations.length > 0 ? (
          <div className="rec-list">
            {recommendations.map((recommendation) => (
              <button
                key={recommendation.id}
                type="button"
                className="rec-item"
                onClick={() => onSelectNote(recommendation.id)}
              >
                <span className="rec-item-title">{recommendation.title}</span>
                <span className="rec-score">
                  {recommendation.score != null
                    ? `${Math.round(recommendation.score * 100)}% ${t.match}`
                    : formatDate(recommendation.updated_at || recommendation.created_at, language)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="main-list-preview">{t.noRecommendations}</p>
        )}
      </div>
    </div>
  );
}
