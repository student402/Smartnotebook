import { useEffect, useMemo, useRef, useState } from "react";
import { uploadNoteImage } from "../../lib/api";
import { parseChecklistLine } from "../../lib/markdown/checklist";
import { renderMarkdown } from "../../lib/markdown/render.jsx";
import { findMarkdownTableStartLine, formatTableRow, isTableSeparator, splitTableRow } from "../../lib/markdown/table";
import { getErrorMessage } from "../../lib/utils/error";
import { normalizeUrl } from "../../lib/utils/url";
import { FormatToolbarIcon, Icon } from "../Icon";
import { TagsInput } from "../tags/TagsInput";

export function NoteEditor({ note, onSave, onCancel, isSaving, onNotify, t, theme }) {
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [tags, setTags] = useState(note?.tags || []);
  const [editorMode, setEditorMode] = useState("write");
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [cursorLineIndex, setCursorLineIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const textareaRef = useRef(null);
  const tableMenuRef = useRef(null);
  const imageInputRef = useRef(null);
  const selectionStateRef = useRef({
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const draftTimer = useRef(null);

  // Autosave draft functionality
  useEffect(() => {
    if (!note || !note.id) return; // Only save draft for existing notes

    // Clear existing timer
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
    }

    // Set new autosave timer (2 seconds delay)
    draftTimer.current = setTimeout(() => {
      // Save draft to localStorage
      const draft = {
        title: title || '',
        content: content || '',
        tags: tags || []
      };
      localStorage.setItem(`note-draft-${note.id}`, JSON.stringify(draft));
    }, 2000);

    return () => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
      }
    };
  }, [title, content, tags, note]);

  // Load draft when starting to edit a note
  useEffect(() => {
    if (!note || !note.id) return;

    const draftKey = `note-draft-${note.id}`;
    const savedDraft = localStorage.getItem(draftKey);

    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        // Only load draft if current values are empty (fresh edit)
        if (!title && !content && tags.length === 0) {
          // Use useState setter functions with a small delay to avoid React hook warnings
          setTimeout(() => {
            setTitle(draft.title || '');
            setContent(draft.content || '');
            setTags(draft.tags || []);
          }, 0);
        }
      } catch (e) {
        console.error('Failed to load draft:', e);
      }
    }
  }, [note, title, content, tags]);

  // Clear draft when note is saved
  useEffect(() => {
    if (!note || !note.id) return;

    // Clear draft when note is saved
    const draftKey = `note-draft-${note.id}`;
    localStorage.removeItem(draftKey);
  }, [note, isSaving]);

  useEffect(() => {
    if (!isTableMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!tableMenuRef.current?.contains(event.target)) {
        setIsTableMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isTableMenuOpen]);

  const captureTextareaState = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return selectionStateRef.current;
    }

    const nextState = {
      selectionStart: textarea.selectionStart ?? 0,
      selectionEnd: textarea.selectionEnd ?? 0,
      scrollTop: textarea.scrollTop ?? 0,
      scrollLeft: textarea.scrollLeft ?? 0,
    };
    selectionStateRef.current = nextState;
    const lineIndex = content.slice(0, nextState.selectionStart).split("\n").length - 1;
    setCursorLineIndex(lineIndex);
    return nextState;
  };

  const restoreTextareaState = (nextSelectionState = selectionStateRef.current) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }

        textarea.focus();
        textarea.setSelectionRange(
          nextSelectionState.selectionStart,
          nextSelectionState.selectionEnd
        );
        textarea.scrollTop = nextSelectionState.scrollTop;
        textarea.scrollLeft = nextSelectionState.scrollLeft;
      });
    });
  };

  const applySelectionUpdate = (formatter) => {
    const selectionState = captureTextareaState();
    const selectionStart = selectionState.selectionStart;
    const selectionEnd = selectionState.selectionEnd;
    const scrollTop = selectionState.scrollTop;
    const scrollLeft = selectionState.scrollLeft;
    const selectedText = content.slice(selectionStart, selectionEnd);
    const nextState = formatter({
      content,
      selectedText,
      selectionStart,
      selectionEnd,
    });

    if (!nextState) {
      return;
    }

    setContent(nextState.value);
    selectionStateRef.current = {
      selectionStart: nextState.selectionStart,
      selectionEnd: nextState.selectionEnd,
      scrollTop,
      scrollLeft,
    };

    restoreTextareaState(selectionStateRef.current);
  };

  const handleContentChange = (event) => {
    const nextValue = event.target.value;
    const { selectionStart, selectionEnd, scrollTop, scrollLeft } = event.target;
    setContent(nextValue);
    selectionStateRef.current = {
      selectionStart,
      selectionEnd,
      scrollTop,
      scrollLeft,
    };
    const lineIndex = nextValue.slice(0, selectionStart).split("\n").length - 1;
    setCursorLineIndex(lineIndex);

    restoreTextareaState(selectionStateRef.current);
  };

  const handleContentInput = (event) => {
    const textarea = event.target;
    const distanceFromBottom = textarea.scrollHeight - (textarea.scrollTop + textarea.clientHeight);
    const isNearBottom = distanceFromBottom <= textarea.clientHeight * 0.2;

    if (!isNearBottom) {
      return;
    }

    textarea.scrollTop = textarea.scrollHeight;
    selectionStateRef.current = {
      ...selectionStateRef.current,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft ?? 0,
    };
  };

  const updateChecklistAtLine = (lineIndex, checked) => {
    setContent((currentContent) => {
      const lines = currentContent.replace(/\r\n/g, "\n").split("\n");
      if (!lines[lineIndex]) {
        return currentContent;
      }

      const parsedChecklist = parseChecklistLine(lines[lineIndex]);
      if (!parsedChecklist) {
        return currentContent;
      }

      lines[lineIndex] = `${parsedChecklist.prefix}[${checked ? "x" : " "}] ${parsedChecklist.text}`;

      return lines.join("\n");
    });
  };

  const appendTableRowAtLine = (lineIndex) => {
    setContent((currentContent) => {
      const lines = currentContent.replace(/\r\n/g, "\n").split("\n");
      if (!lines[lineIndex] || !lines[lineIndex + 1] || !isTableSeparator(lines[lineIndex + 1])) {
        return currentContent;
      }

      const header = splitTableRow(lines[lineIndex]);
      if (header.length === 0) {
        return currentContent;
      }

      let tableEndIndex = lineIndex + 2;
      while (tableEndIndex < lines.length && lines[tableEndIndex].trim() && lines[tableEndIndex].includes("|")) {
        tableEndIndex += 1;
      }

      const bodyRowCount = Math.max(tableEndIndex - (lineIndex + 2), 0);
      const newRow = header.map((_, cellIndex) =>
        cellIndex === 0 ? `Item ${bodyRowCount + 1}` : `Value ${bodyRowCount + 1}.${cellIndex}`
      );
      lines.splice(tableEndIndex, 0, formatTableRow(newRow));
      return lines.join("\n");
    });
  };

  const appendTableColumnAtLine = (lineIndex) => {
    setContent((currentContent) => {
      const lines = currentContent.replace(/\r\n/g, "\n").split("\n");
      if (!lines[lineIndex] || !lines[lineIndex + 1] || !isTableSeparator(lines[lineIndex + 1])) {
        return currentContent;
      }

      const header = splitTableRow(lines[lineIndex]);
      if (header.length === 0) {
        return currentContent;
      }

      let tableEndIndex = lineIndex + 2;
      while (tableEndIndex < lines.length && lines[tableEndIndex].trim() && lines[tableEndIndex].includes("|")) {
        tableEndIndex += 1;
      }

      const nextColumnIndex = header.length + 1;
      const updatedHeader = [...header, `Column ${nextColumnIndex}`];
      const updatedSeparator = [...splitTableRow(lines[lineIndex + 1]), "---"];
      lines[lineIndex] = formatTableRow(updatedHeader);
      lines[lineIndex + 1] = formatTableRow(updatedSeparator);

      for (let rowIndex = lineIndex + 2; rowIndex < tableEndIndex; rowIndex += 1) {
        const cells = splitTableRow(lines[rowIndex]);
        const bodyIndex = rowIndex - (lineIndex + 1);
        lines[rowIndex] = formatTableRow([...cells, `Value ${bodyIndex}.${nextColumnIndex}`]);
      }

      return lines.join("\n");
    });
  };

  const activeTableLine = useMemo(() => {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    return findMarkdownTableStartLine(lines, cursorLineIndex);
  }, [content, cursorLineIndex]);

  const wrapSelection = (before, after = before, placeholder = "") => {
    applySelectionUpdate(({ content: currentContent, selectedText, selectionStart, selectionEnd }) => {
      const value = selectedText || placeholder;
      const nextValue = `${before}${value}${after}`;

      return {
        value: `${currentContent.slice(0, selectionStart)}${nextValue}${currentContent.slice(selectionEnd)}`,
        selectionStart: selectionStart + before.length,
        selectionEnd: selectionStart + before.length + value.length,
      };
    });
  };

  const prefixLines = (prefixFactory) => {
    applySelectionUpdate(({ content: currentContent, selectionStart, selectionEnd }) => {
      const blockStart = currentContent.lastIndexOf("\n", Math.max(selectionStart - 1, 0)) + 1;
      const nextLineBreak = currentContent.indexOf("\n", selectionEnd);
      const blockEnd = nextLineBreak === -1 ? currentContent.length : nextLineBreak;
      const selectedBlock = currentContent.slice(blockStart, blockEnd);
      const lines = selectedBlock.split("\n");
      const formattedBlock = lines
        .map((line, lineIndex) => (line.trim() ? prefixFactory(line, lineIndex) : line))
        .join("\n");

      return {
        value: `${currentContent.slice(0, blockStart)}${formattedBlock}${currentContent.slice(blockEnd)}`,
        selectionStart: blockStart,
        selectionEnd: blockStart + formattedBlock.length,
      };
    });
  };

  const insertTemplate = (template) => {
    applySelectionUpdate(({ content: currentContent, selectedText, selectionStart, selectionEnd }) => {
      const value = selectedText || template;

      return {
        value: `${currentContent.slice(0, selectionStart)}${value}${currentContent.slice(selectionEnd)}`,
        selectionStart,
        selectionEnd: selectionStart + value.length,
      };
    });
  };

  const buildTableTemplate = (columnCount, rowCount) => {
    const header = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
    const separator = Array.from({ length: columnCount }, () => "---");
    const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
      Array.from({ length: columnCount }, (_, columnIndex) =>
        columnIndex === 0 ? `Item ${rowIndex + 1}` : `Value ${rowIndex + 1}.${columnIndex}`
      )
    );

    return [
      `| ${header.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
  };

  const tableOptions = [
    { label: "Simple table", type: "table", template: buildTableTemplate(2, 2) },
    { label: "3 columns", type: "table3x2", template: buildTableTemplate(3, 2) },
    { label: "4 columns", type: "table4x2", template: buildTableTemplate(4, 2) },
    { label: "More rows", type: "table2x4", template: buildTableTemplate(2, 4) },
    { label: "Big table", type: "table4x4", template: buildTableTemplate(4, 4) },
    {
      label: "Comparison table",
      type: "tableCompare",
      template:
        "| Feature | Option A | Option B |\n| --- | --- | --- |\n| Pros | Good fit | Good fit |\n| Cons | Tradeoff | Tradeoff |\n| Notes | Comment | Comment |",
    },
  ];

  const formattingGroups = [
    [
      { label: "Bold", type: "bold" },
      { label: "Italic", type: "italic" },
      { label: "Heading 1", type: "heading1" },
      { label: "Heading 2", type: "heading2" },
    ],
    [
      { label: "Bullet List", type: "bulletList" },
      { label: "Numbered List", type: "numberedList" },
      { label: "Checklist", type: "checklist" },
      { label: "Quote", type: "quote" },
    ],
    [
      { label: "Code", type: "code" },
      { label: "Table", type: "tableMenu" },
      { label: "Link", type: "link" },
      { label: t.insertImage, type: "image" },
    ],
  ];

  const preventToolbarMouseDown = (event) => {
    if (editorMode === "write") {
      event.preventDefault();
    }
  };

  const insertUploadedImageMarkdown = (markdown) => {
    applySelectionUpdate(({ content: currentContent, selectionStart, selectionEnd }) => {
      const needsLeadingBreak = selectionStart > 0 && !currentContent.slice(0, selectionStart).endsWith("\n");
      const needsTrailingBreak = selectionEnd < currentContent.length && !currentContent.slice(selectionEnd).startsWith("\n");
      const value = `${needsLeadingBreak ? "\n" : ""}${markdown}${needsTrailingBreak ? "\n" : ""}`;

      return {
        value: `${currentContent.slice(0, selectionStart)}${value}${currentContent.slice(selectionEnd)}`,
        selectionStart: selectionStart + value.length,
        selectionEnd: selectionStart + value.length,
      };
    });
  };

  const handleImageFiles = async (fileList) => {
    const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }

    captureTextareaState();
    setIsUploadingImage(true);

    try {
      const uploadedMarkdown = [];

      for (const file of imageFiles) {
        const response = await uploadNoteImage(file);
        const alt = (file.name || "image").replace(/\.[^.]+$/, "");
        uploadedMarkdown.push(`![${alt}](${normalizeUrl(response.data.url)})`);
      }

      insertUploadedImageMarkdown(uploadedMarkdown.join("\n\n"));
    } catch (error) {
      onNotify?.(getErrorMessage(error, t.imageUploadError), "error");
    } finally {
      setIsUploadingImage(false);
      setIsDragOver(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const handleEditorDrop = async (event) => {
    event.preventDefault();
    setIsDragOver(false);
    await handleImageFiles(event.dataTransfer?.files);
  };

  const handleFormattingAction = (type) => {
    switch (type) {
      case "bold":
        wrapSelection("**", "**", "bold text");
        break;
      case "italic":
        wrapSelection("*", "*", "italic text");
        break;
      case "heading1":
        prefixLines((line) => `# ${line.replace(/^#+\s*/, "")}`);
        break;
      case "heading2":
        prefixLines((line) => `## ${line.replace(/^#+\s*/, "")}`);
        break;
      case "bulletList":
        prefixLines((line) => `- ${line.replace(/^[-*]\s+/, "")}`);
        break;
      case "numberedList":
        prefixLines((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`);
        break;
      case "checklist":
        prefixLines((line) => `- [ ] ${line.replace(/^((?:[-*]\s+)?)\[(?: |x|X)\]\s+/, "").replace(/^[-*]\s+/, "")}`);
        break;
      case "quote":
        prefixLines((line) => `> ${line.replace(/^>\s?/, "")}`);
        break;
      case "code":
        wrapSelection("```\n", "\n```", "code block");
        break;
      case "tableMenu":
        setIsTableMenuOpen((current) => !current);
        break;
      case "table":
      case "table3x2":
      case "table4x2":
      case "table2x4":
      case "table4x4":
      case "tableCompare": {
        const selectedOption = tableOptions.find((option) => option.type === type);
        if (selectedOption) {
          insertTemplate(selectedOption.template);
        }
        setIsTableMenuOpen(false);
        break;
      }
      case "link":
        wrapSelection("[", "](https://example.com)", "link text");
        break;
      case "image":
        imageInputRef.current?.click();
        break;
      default:
        break;
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      return;
    }

    onSave({
      title: title.trim(),
      content,
      tags,
    });
  };

  return (
    <div className="editor-wrap">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden-input"
        onChange={(event) => handleImageFiles(event.target.files)}
      />
      <div className="editor-shell">
        <div className="editor-top">
          <div className="editor-top-copy">
            <h2>{note ? t.noteEditorEdit : t.noteEditorNew}</h2>
          </div>
          <div className="editor-toolbar-stack">
            <div className="editor-format-label">{t.markdownTools}</div>
            <div className="editor-toolbar-row">
              <div className="editor-format-toolbar">
                <div className="editor-format-chips">
                  {formattingGroups.map((group, groupIndex) => (
                    <div key={`format-group-${groupIndex}`} className="editor-format-group">
                      {group.map((action) => (
                        action.type === "tableMenu" ? (
                          <div key={action.label} className="format-menu" ref={tableMenuRef}>
                            <button
                              type="button"
                              className="format-chip format-menu-button"
                              onMouseDown={preventToolbarMouseDown}
                              onClick={() => handleFormattingAction(action.type)}
                              disabled={editorMode !== "write"}
                              title={action.label}
                              aria-label={action.label}
                              aria-haspopup="menu"
                              aria-expanded={isTableMenuOpen}
                            >
                              <FormatToolbarIcon type="table" />
                              <span className="format-menu-caret">▾</span>
                            </button>
                            {isTableMenuOpen ? (
                              <div className="format-menu-panel" role="menu" aria-label="Table options">
                                {tableOptions.map((option) => (
                                  <button
                                    key={option.type}
                                    type="button"
                                    className="format-menu-option"
                                    onMouseDown={preventToolbarMouseDown}
                                    onClick={() => handleFormattingAction(option.type)}
                                    role="menuitem"
                                  >
                                    <span className="format-menu-option-icon">
                                      <FormatToolbarIcon type="table" />
                                    </span>
                                    <span className="format-menu-option-label">{option.label}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            key={action.label}
                            type="button"
                            className="format-chip"
                            onMouseDown={preventToolbarMouseDown}
                            onClick={() => handleFormattingAction(action.type)}
                            disabled={editorMode !== "write" || isUploadingImage}
                            title={action.label}
                            aria-label={action.label}
                          >
                            <FormatToolbarIcon type={action.type} />
                          </button>
                        )
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="editor-toolbar">
                <div className="editor-mode-switch">
                  <button
                    type="button"
                    className={editorMode === "write" ? "active" : ""}
                    onClick={() => setEditorMode("write")}
                  >
                    {t.editorWrite}
                  </button>
                  <button
                    type="button"
                    className={editorMode === "preview" ? "active" : ""}
                    onClick={() => setEditorMode("preview")}
                  >
                    {t.editorPreview}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="editor-field">
          <div className="editor-label">{t.noteTitleLabel}</div>
          <input
            className="editor-input title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.noteTitlePlaceholder}
            autoFocus
          />
        </div>
        <div className="editor-field">
          <div className="editor-label">{t.noteTagsLabel}</div>
          <TagsInput tags={tags} onChange={setTags} t={t} theme={theme} />
        </div>
        <div className="editor-field content-field">
          <div className="editor-label">{t.noteContentLabel}</div>
          {editorMode === "write" ? (
            <>
              {activeTableLine !== null ? (
                <div className="editor-table-tools">
                  <button
                    type="button"
                    className="note-table-tool"
                    onClick={() => appendTableRowAtLine(activeTableLine)}
                  >
                    <span className="note-table-tool-plus">+</span>
                    Row
                  </button>
                  <button
                    type="button"
                    className="note-table-tool"
                    onClick={() => appendTableColumnAtLine(activeTableLine)}
                  >
                    <span className="note-table-tool-plus">+</span>
                    Column
                  </button>
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                className={`editor-textarea${isDragOver ? " dragover" : ""}`}
                value={content}
                onChange={handleContentChange}
                onInput={handleContentInput}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer?.types?.includes("Files")) {
                    setIsDragOver(true);
                  }
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleEditorDrop}
                onScroll={captureTextareaState}
                onSelect={captureTextareaState}
                onClick={captureTextareaState}
                onKeyUp={captureTextareaState}
                style={{ overflowY: "auto", scrollBehavior: "smooth" }}
                placeholder={t.noteContentPlaceholder}
              />
              <div className="editor-drop-hint">{t.imageDropHint}</div>
            </>
          ) : (
            <div className="editor-preview note-body note-markdown">
              {renderMarkdown(content, {
                onToggleChecklist: updateChecklistAtLine,
                onAppendTableRow: appendTableRowAtLine,
                onAppendTableColumn: appendTableColumnAtLine,
                readOnlyChecklist: false,
                t,
              }) || <span style={{ color: "var(--text-muted)" }}>{t.noteEmpty}</span>}
            </div>
          )}
        </div>
        <div className="editor-actions">
          <button type="button" className="btn-save" onClick={handleSave} disabled={isSaving}>
            <Icon name="check" size={15} /> {isSaving ? t.saving : t.save}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
