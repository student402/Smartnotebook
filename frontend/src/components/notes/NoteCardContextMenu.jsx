import { useState } from "react";
import { Icon } from "../Icon";

export function NoteCardContextMenu({ note, onEditNote, onDeleteNote, onExportNote, t }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleEdit = () => {
    onEditNote?.(note);
    setIsOpen(false);
  };

  const handleDelete = () => {
    onDeleteNote?.(note);
    setIsOpen(false);
  };

  const handleExport = () => {
    onExportNote?.(note);
    setIsOpen(false);
  };

  return (
    <div className="note-card-context-menu">
      <button
        type="button"
        className="btn-icon"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={t?.exportMenuTitle || "Menu"}
      >
        <Icon name="menu" size={14} />
      </button>
      {isOpen ? (
        <div className="note-card-menu" role="menu">
          <button type="button" className="note-card-menu-item" role="menuitem" onClick={handleEdit}>
            <Icon name="edit" size={14} />
            <span>{t?.edit || "Edit"}</span>
          </button>
          <button type="button" className="note-card-menu-item" role="menuitem" onClick={handleExport}>
            <Icon name="download" size={14} />
            <span>{t?.exportMenuTitle || "Export"}</span>
          </button>
          <button type="button" className="note-card-menu-item danger" role="menuitem" onClick={handleDelete}>
            <Icon name="trash" size={14} />
            <span>{t?.delete || "Delete"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
