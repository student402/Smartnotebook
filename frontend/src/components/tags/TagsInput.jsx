import { useState } from "react";
import { getTagColor } from "../../lib/utils/tagColor";

export function TagsInput({ tags, onChange, t, theme }) {
  const [input, setInput] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");

  const commitTag = () => {
    const nextTag = input.trim().replace(/,$/, "");
    if (!nextTag || tags.includes(nextTag)) {
      setInput("");
      return;
    }

    onChange([...tags, nextTag]);
    setInput("");
  };

  const saveTagEdit = (index) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      // If empty, remove the tag
      onChange(tags.filter((_, i) => i !== index));
    } else if (trimmed !== tags[index]) {
      // If changed and not duplicate, update the tag
      const newTags = [...tags];
      newTags[index] = trimmed;
      onChange(newTags);
    }
    setEditingIndex(null);
    setEditValue("");
  };

  const handleKeyDown = (event) => {
    if (editingIndex !== null) {
      if (event.key === "Enter") {
        event.preventDefault();
        saveTagEdit(editingIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setEditingIndex(null);
        setEditValue(tags[editingIndex]);
        return;
      }
      return; // Prevent other keys from interfering with editing
    }

    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTag();
      return;
    }

    if (event.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="tags-input-wrap">
      {tags.map((tag, index) => {
        const [background, color] = getTagColor(tag, theme);
        const isEditing = editingIndex === index;

        return (
          <span key={tag} className="tag-removable" style={{ background, color }}>
            {isEditing ? (
              <input
                className="tag-text-input"
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => saveTagEdit(index)}
              />
            ) : (
              <>
                {tag}
                <button
                  type="button"
                  className="tag-remove-btn"
                  onClick={() => onChange(tags.filter((value) => value !== tag))}
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </>
            )}
          </span>
        );
      })}
      <input
        className="tag-text-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitTag}
        placeholder={tags.length > 0 ? "" : t.addTagPlaceholder}
      />
    </div>
  );
}
