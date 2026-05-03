import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearStoredTokens, createNote, deleteNote, exportBackup,
  getSimilarNotes, importNoteFile, restoreBackup, updateNote,
} from "./lib/api";
import { FontSizeSwitch } from "./components/controls/FontSizeSwitch";
import { LanguageSwitch } from "./components/controls/LanguageSwitch";
import { ThemeSwitch } from "./components/controls/ThemeSwitch";
import { Icon } from "./components/Icon";
import { NoteEditor } from "./components/editor/NoteEditor";
import { NotesGridContent } from "./components/notes/NotesGridContent";
import { NotesListContent } from "./components/notes/NotesListContent";
import { NoteView } from "./components/notes/NoteView";
import Login from "./lib/Login";
import { parseChecklistLine } from "./lib/markdown/checklist";
import { detectLanguage, detectNoteFontSize, detectTheme, getConstrainedNoteFontSize, getMaxNoteFontSize } from "./lib/utils/detect";
import { formatDate } from "./lib/utils/date";
import { getErrorMessage } from "./lib/utils/error";
import { exportNoteAsMarkdown, exportNoteAsPdf, exportNoteAsTxt, triggerDownload } from "./lib/utils/export";
import { getPlainTextPreview } from "./lib/utils/preview";
import { getTagColor } from "./lib/utils/tagColor";
import { useNotes } from "./lib/hooks/useNotes";
import { useSession } from "./lib/hooks/useSession";
import "./App.css";

const MOBILE_BREAKPOINT = 768;
const NOTES_PAGE_SIZE = 20;
const LANGUAGE_KEY = "smartnotebook-language";
const THEME_KEY = "smartnotebook-theme";
const NOTE_FONT_SIZE_KEY = "smartnotebook-note-font-size";

const UI_TEXT = {
  ru: {
    appSubtitle: "умный блокнот",
    searchPlaceholder: "Поиск заметок...",
    notesCount: (count) => `${count} заметок`,
    noResultsTitle: "Ничего не найдено",
    noResultsDescription: "Измените строку поиска или снимите фильтр по тегу.",
    noNotesTitle: "Нет заметок",
    noNotesDescription: "Создайте первую заметку, импортируйте файл или измените активный фильтр.",
    noteEmpty: "Содержимое пусто",
    noteTitleLabel: "Заголовок",
    noteTagsLabel: "Теги",
    noteContentLabel: "Содержимое",
    noteTitlePlaceholder: "Название заметки...",
    noteContentPlaceholder: "Начните писать...",
    addTagPlaceholder: "Добавить тег...",
    markdownTools: "Форматирование",
    editorWrite: "Редактор",
    editorPreview: "Предпросмотр",
    save: "Сохранить",
    saving: "Сохранение...",
    cancel: "Отмена",
    edit: "Редактировать",
    delete: "Удалить",
    create: "Новая заметка",
    createShort: "Новая",
    import: "Импорт",
    importShort: "Импорт",
    importFile: "Импорт файла",
    importHint: "Поддерживаются .txt, .md и .pdf",
    exportTxt: "TXT",
    exportMd: "MD",
    exportPdf: "PDF",
    listView: "Список",
    gridView: "Сетка",
    allNotesTitle: "Все заметки",
    allNotesDescription: "Быстрый обзор заметок со всеми тегами и датами обновления.",
    gridTitle: "Сетка заметок",
    gridDescription: "Карточки заметок с полным набором тегов.",
    recommendations: "Похожие заметки",
    noRecommendations: "Пока нет рекомендаций",
    match: "совпадение",
    back: "Назад",
    menu: "Меню",
    loginTitle: "SmartNotebook",
    loginSubtitle: "Вход и регистрация в едином интерфейсе",
    loginMode: "Вход",
    registerMode: "Регистрация",
    username: "Имя пользователя",
    emailOptional: "Email (необязательно)",
    password: "Пароль",
    confirmPassword: "Подтвердите пароль",
    loginButton: "Войти",
    registerButton: "Создать аккаунт",
    switchToRegister: "Нужен аккаунт?",
    switchToLogin: "Назад ко входу",
    loginFeatureThemeTitle: "Темы оформления",
    loginFeatureThemeText: "Светлая и тёмная тема на выбор",
    loginFeatureFocusTitle: "Фокус на контенте",
    loginFeatureFocusText: "Минималистичный интерфейс без лишнего",
    loginFeatureLanguageTitle: "Два языка",
    loginFeatureLanguageText: "Русский и английский интерфейс",
    authError: "Неверное имя пользователя или пароль",
    authRegisterSuccess: "Регистрация прошла успешно. Теперь можно войти.",
    connectionError: "Не удалось подключиться к API. Проверьте backend и настройки адреса.",
    saveSuccess: "Заметка сохранена",
    deleteSuccess: "Заметка удалена",
    saveError: "Ошибка сохранения",
    deleteError: "Ошибка удаления",
    importSuccess: "Файл импортирован как новая заметка",
    importError: "Не удалось импортировать файл",
    exportError: "Не удалось подготовить экспорт",
    importAction: "Импортировать файл",
    createEmptyButton: "Создать заметку",
    importedTitleFallback: "Импортированная заметка",
    noteEditorNew: "Новая заметка",
    noteEditorEdit: "Редактирование заметки",
    deleteConfirm: (title) => `Удалить заметку "${title}"?`,
    exportMenuTitle: "Экспорт",
    languageLabel: "Язык",
    languageRu: "RU",
    languageEn: "EN",
    importInProgress: "Импорт...",
    printTitleSuffix: "Экспорт в PDF",
    themeLabel: "Тема",
    themeDark: "Темная",
    themeLight: "Светлая",
    textSizeLabel: "Размер текста",
    optionsLabel: "Настройки",
    textSizeDecrease: "A-",
    textSizeIncrease: "A+",
    sessionExpiring: "Сессия скоро завершится. Сохраните работу.",
    sessionExpired: "Сессия завершена. Войдите снова.",
    noTagNotesDescription: (tag) => `Нет заметок с тегом "${tag}". Попробуйте другой тег.`,
    clearTagFilter: "Сбросить фильтр по тегу",
    insertVideo: "Видео",
    backupExport: "Бэкап",
    backupRestore: "Восстановить",
    backupSuccess: "Резервная копия создана",
    backupError: "Не удалось создать резервную копию",
    backupRestoreSuccess: (count) => `Восстановлено заметок: ${count}`,
    backupRestoreError: "Не удалось восстановить резервную копию",
    linkPreviewUnavailable: "Превью ссылки недоступно",
    openOriginalLink: "Открыть ссылку",
    playVideo: "Смотреть видео",
    insertImage: "Изображение",
    imageUploadError: "Не удалось загрузить изображение",
    imageDropHint: "Перетащите изображение сюда или используйте кнопку вставки изображения.",
    imageOnlyPreview: "🖼 Изображение",
  },
  en: {
    appSubtitle: "smart notebook",
    searchPlaceholder: "Search notes...",
    notesCount: (count) => `${count} notes`,
    noResultsTitle: "Nothing found",
    noResultsDescription: "Change the search query or clear the active tag filter.",
    noNotesTitle: "No notes yet",
    noNotesDescription: "Create your first note, import a file, or change the active filter.",
    noteEmpty: "Content is empty",
    noteTitleLabel: "Title",
    noteTagsLabel: "Tags",
    noteContentLabel: "Content",
    noteTitlePlaceholder: "Note title...",
    noteContentPlaceholder: "Start writing...",
    addTagPlaceholder: "Add tag...",
    markdownTools: "Formatting",
    editorWrite: "Write",
    editorPreview: "Preview",
    save: "Save",
    saving: "Saving...",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    create: "New note",
    createShort: "New",
    import: "Import",
    importShort: "Import",
    importFile: "Import file",
    importHint: "Supports .txt, .md, and .pdf",
    exportTxt: "TXT",
    exportMd: "MD",
    exportPdf: "PDF",
    listView: "List",
    gridView: "Grid",
    allNotesTitle: "All notes",
    allNotesDescription: "Quick overview with complete tags and updated dates.",
    gridTitle: "Notes grid",
    gridDescription: "Cards with full tags and short previews.",
    recommendations: "Similar notes",
    noRecommendations: "No recommendations yet",
    match: "match",
    back: "Back",
    menu: "Menu",
    loginTitle: "SmartNotebook",
    loginSubtitle: "One interface for login and registration",
    loginMode: "Login",
    registerMode: "Register",
    username: "Username",
    emailOptional: "Email (optional)",
    password: "Password",
    confirmPassword: "Confirm password",
    loginButton: "Login",
    registerButton: "Create account",
    switchToRegister: "Need an account?",
    switchToLogin: "Back to login",
    loginFeatureThemeTitle: "Theme support",
    loginFeatureThemeText: "Light and dark mode included",
    loginFeatureFocusTitle: "Focus on content",
    loginFeatureFocusText: "Minimal interface, no distractions",
    loginFeatureLanguageTitle: "Two languages",
    loginFeatureLanguageText: "Russian and English UI",
    authError: "Invalid username or password",
    authRegisterSuccess: "Registration successful. You can now log in.",
    connectionError: "Could not reach the API. Check the backend and base URL settings.",
    saveSuccess: "Note saved",
    deleteSuccess: "Note deleted",
    saveError: "Save failed",
    deleteError: "Delete failed",
    importSuccess: "File imported as a new note",
    importError: "File import failed",
    exportError: "Could not prepare export",
    importAction: "Import file",
    createEmptyButton: "Create note",
    importedTitleFallback: "Imported note",
    noteEditorNew: "New note",
    noteEditorEdit: "Edit note",
    deleteConfirm: (title) => `Delete note "${title}"?`,
    exportMenuTitle: "Export",
    languageLabel: "Language",
    languageRu: "RU",
    languageEn: "EN",
    importInProgress: "Importing...",
    printTitleSuffix: "PDF export",
    themeLabel: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    textSizeLabel: "Text size",
    optionsLabel: "Options",
    textSizeDecrease: "A-",
    textSizeIncrease: "A+",
    sessionExpiring: "Session ending soon. Save your work.",
    sessionExpired: "Session ended. Please log in again.",
    noTagNotesDescription: (tag) => `No notes with tag "${tag}". Try a different tag.`,
    clearTagFilter: "Clear tag filter",
    insertVideo: "Video",
    backupExport: "Backup",
    backupRestore: "Restore",
    backupSuccess: "Backup exported",
    backupError: "Could not export backup",
    backupRestoreSuccess: (count) => `Restored notes: ${count}`,
    backupRestoreError: "Could not restore backup",
    linkPreviewUnavailable: "Link preview unavailable",
    openOriginalLink: "Open link",
    playVideo: "Play video",
    insertImage: "Image",
    imageUploadError: "Could not upload image",
    imageDropHint: "Drop an image here or use the insert image button.",
    imageOnlyPreview: "🖼 Image",
  },
};


export default function App() {
  const [language, setLanguage] = useState(detectLanguage);
  const [theme, setTheme] = useState(detectTheme);
  const [noteFontSize, setNoteFontSize] = useState(detectNoteFontSize);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem("access")));
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [recommendations, setRecommendations] = useState([]);
  const [toast, setToast] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const importInputRef = useRef(null);
  const backupRestoreInputRef = useRef(null);
  const noteContentRef = useRef(null);
  const optionsMenuRef = useRef(null);
  const toastTimer = useRef();
  const draftTimer = useRef(null);

  const t = UI_TEXT[language];
  const normalizeNotes = (value) => (Array.isArray(value) ? value : value?.results ?? []);
  const clearRecommendations = useCallback(() => {
    setRecommendations([]);
  }, []);

  const resetWorkspaceState = useCallback(() => {
    setSelectedId(null);
    clearRecommendations();
    setEditing(false);
    setIsNew(false);

    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
  }, [clearRecommendations]);

  const handleAuthenticationError = useCallback(() => {
    clearStoredTokens();
    window.setTimeout(() => {
      resetWorkspaceState();
      setIsAuthenticated(false);
    }, 0);
  }, [resetWorkspaceState]);

  const {
    notes,
    setNotes,
    errorMessage,
    setErrorMessage,
    loadNotesPage,
  } = useNotes({
    isAuthenticated,
    connectionErrorMessage: t.connectionError,
    onAuthenticationError: handleAuthenticationError,
    pageSize: NOTES_PAGE_SIZE,
  });

  const notesList = useMemo(() => normalizeNotes(notes), [notes]);
  const maxNoteFontSize = getMaxNoteFontSize(typeof window !== "undefined" ? window.innerWidth : 1280);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearStoredTokens();
    window.setTimeout(() => {
      resetWorkspaceState();
      setIsAuthenticated(false);
      showToast(t.sessionExpired, "error");
    }, 0);
  }, [resetWorkspaceState, showToast, t.sessionExpired]);

  const handleSessionExpiring = useCallback(() => {
    showToast(t.sessionExpiring, "error");
  }, [showToast, t.sessionExpiring]);

  useSession({
    isAuthenticated,
    onExpired: handleSessionExpired,
    onExpiring: handleSessionExpiring,
  });

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(NOTE_FONT_SIZE_KEY, noteFontSize);
  }, [noteFontSize]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      setNoteFontSize((currentSize) => getConstrainedNoteFontSize(currentSize, window.innerWidth));
      if (!mobile) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isOptionsOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!optionsMenuRef.current?.contains(event.target)) {
        setIsOptionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOptionsOpen]);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    let isMounted = true;

    async function loadRecommendations() {
      try {
        const response = await getSimilarNotes(selectedId);
        if (isMounted) {
          setRecommendations(response.data);
        }
      } catch {
        if (isMounted) {
          setRecommendations([]);
        }
      }
    }

    loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, [selectedId]);



  const allTags = useMemo(
    () => [...new Set(notesList.flatMap((note) => note.tags))].sort((left, right) => left.localeCompare(right)),
    [notesList]
  );

  const filteredNotes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return notesList.filter((note) => {
      const matchesSearch =
        !normalizedSearch ||
        note.title.toLowerCase().includes(normalizedSearch) ||
        note.content.toLowerCase().includes(normalizedSearch);
      const matchesTag = !activeTag || note.tags.includes(activeTag);

      return matchesSearch && matchesTag;
    });
  }, [activeTag, notesList, search]);

  const selectedNote = useMemo(
    () => notesList.find((note) => note.id === selectedId) || null,
    [notesList, selectedId]
  );

  const closeEditor = () => {
    setEditing(false);
    setIsNew(false);
  };

  const openNote = (noteId) => {
    clearRecommendations();
    setSelectedId(noteId);
    setEditing(false);
    setIsNew(false);
    setIsSidebarOpen(false);
  };

  const handleNew = () => {
    clearRecommendations();
    setSelectedId(null);
    setIsNew(true);
    setEditing(true);
    setIsSidebarOpen(false);
  };

  const handleViewChange = (mode) => {
    clearRecommendations();
    setViewMode(mode);
    setSelectedId(null);
    closeEditor();
    setIsOptionsOpen(false);
  };

  const handleSave = async (payload) => {
    setIsSaving(true);

    try {
      if (isNew) {
        const response = await createNote(payload);
        setNotes((currentNotes) => [response.data, ...normalizeNotes(currentNotes)]);
        clearRecommendations();
        setSelectedId(response.data.id);
      } else {
        const response = await updateNote(selectedId, payload);
        setNotes((currentNotes) =>
          normalizeNotes(currentNotes).map((note) => (note.id === selectedId ? response.data : note))
        );
      }

      closeEditor();
      setErrorMessage("");
      showToast(t.saveSuccess);
    } catch (error) {
      showToast(getErrorMessage(error, t.saveError), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNote || !window.confirm(t.deleteConfirm(selectedNote.title))) {
      return;
    }

    try {
      await deleteNote(selectedId);
      setNotes((currentNotes) => normalizeNotes(currentNotes).filter((note) => note.id !== selectedId));
      setSelectedId(null);
      setRecommendations([]);
      showToast(t.deleteSuccess);
    } catch (error) {
      showToast(getErrorMessage(error, t.deleteError), "error");
    }
  };

  const handleImport = async (file) => {
    setIsImporting(true);

    try {
      const response = await importNoteFile(file);
      setNotes((currentNotes) => [response.data, ...normalizeNotes(currentNotes)]);
      clearRecommendations();
      setSelectedId(response.data.id);
      setEditing(false);
      setIsNew(false);
      setIsSidebarOpen(false);
      showToast(t.importSuccess);
    } catch (error) {
      showToast(getErrorMessage(error, t.importError), "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportInputChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await handleImport(file);
  };

  const handleBackupExport = async () => {
    try {
      const response = await exportBackup();
      triggerDownload(
        `smartnotebook-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(response.data, null, 2),
        "application/json;charset=utf-8"
      );
      showToast(t.backupSuccess);
    } catch (error) {
      showToast(getErrorMessage(error, t.backupError), "error");
    }
  };

  const handleBackupRestore = async (file) => {
    if (!file) {
      return;
    }

    setIsRestoringBackup(true);

    try {
      const response = await restoreBackup(file);
      const normalized = await loadNotesPage();
      setNotes(normalized);
      clearRecommendations();
      setSelectedId(normalized[0]?.id ?? null);
      setEditing(false);
      setIsNew(false);
      setIsSidebarOpen(false);
      showToast(t.backupRestoreSuccess(response.data.restored || 0));
    } catch (error) {
      showToast(getErrorMessage(error, t.backupRestoreError), "error");
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleBackupRestoreInputChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleBackupRestore(file);
    event.target.value = "";
  };

  const handleChecklistToggle = async (lineIndex, checked) => {
    if (!selectedNote) {
      return;
    }

    const lines = selectedNote.content.replace(/\r\n/g, "\n").split("\n");
    if (!lines[lineIndex]) {
      return;
    }

    const parsedChecklist = parseChecklistLine(lines[lineIndex]);
    if (!parsedChecklist) {
      return;
    }

    const nextContent = lines.map((line, currentIndex) => (
      currentIndex === lineIndex
        ? `${parsedChecklist.prefix}[${checked ? "x" : " "}] ${parsedChecklist.text}`
        : line
    )).join("\n");

    const optimisticNote = { ...selectedNote, content: nextContent };
    setNotes((currentNotes) => normalizeNotes(currentNotes).map((note) => (
      note.id === selectedNote.id ? optimisticNote : note
    )));

    try {
      const response = await updateNote(selectedNote.id, {
        title: selectedNote.title,
        content: nextContent,
        tags: selectedNote.tags,
      });
      setNotes((currentNotes) => normalizeNotes(currentNotes).map((note) => (
        note.id === selectedNote.id ? response.data : note
      )));
    } catch (error) {
      setNotes((currentNotes) => normalizeNotes(currentNotes).map((note) => (
        note.id === selectedNote.id ? selectedNote : note
      )));
      showToast(getErrorMessage(error, t.saveError), "error");
    }
  };

  const handleExport = (format) => {
    if (!selectedNote) {
      return;
    }

    try {
      if (format === "txt") {
        exportNoteAsTxt(selectedNote, language, t);
        return;
      }

      if (format === "md") {
        exportNoteAsMarkdown(selectedNote, language, t);
        return;
      }

      if (format === "pdf" && !exportNoteAsPdf(selectedNote, language, t, noteContentRef.current)) {
        showToast(t.exportError, "error");
      }
    } catch {
      showToast(t.exportError, "error");
    }
  };

  if (!isAuthenticated) {
    return (
      <>
        <Login
          language={language}
          onChangeLanguage={setLanguage}
          theme={theme}
          onChangeTheme={setTheme}
          onSuccess={() => setIsAuthenticated(true)}
          copy={t}
        />
      </>
    );
  }

  const showBackButton = editing || (isMobile && selectedNote);
  const showTopbarTitle = editing;
  const compactTopbar = isMobile;

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        className="hidden-input"
        onChange={handleImportInputChange}
      />
      <input
        ref={backupRestoreInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden-input"
        onChange={handleBackupRestoreInputChange}
      />
      <div
        className={`sidebar-backdrop${isSidebarOpen ? " open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      <div className="app">
        <aside className={`sidebar${isSidebarOpen ? " open" : ""}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="sidebar-logo">
            <h1>
              <Icon name="book" size={20} />
              SmartNotebook
            </h1>
            <div className="subtitle">{t.appSubtitle}</div>
          </div>
          <div className="sidebar-search">
            <div className="search-wrap">
              <Icon name="search" size={15} />
              <input
                className="search-input"
                placeholder={t.searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="sidebar-tags">
              {allTags.map((tag) => {
                const [background, color] = getTagColor(tag, theme);

                return (
                  <button
                    key={tag}
                    type="button"
                    className={`tag-filter${activeTag === tag ? " active" : ""}`}
                    style={{ background, color }}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  >
                    <Icon name="tag" size={10} />
                    <span className="tag-chip-text" title={tag}>{tag}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="notes-list-label">{t.notesCount(filteredNotes.length)}</div>
          <div className="notes-list" style={{ flex: 1, minHeight: 0 }}>
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={`note-item${selectedId === note.id ? " active" : ""}`}
                onClick={() => openNote(note.id)}
              >
                <div className="note-item-title">{note.title}</div>
                <div className="note-item-preview">{getPlainTextPreview(note.content, t) || t.noteEmpty}</div>
                {note.tags.length > 0 && (
                  <div className="sidebar-note-tags">
                    {note.tags.slice(0, 3).map((tag) => {
                      const [background, color] = getTagColor(tag, theme);

                      return (
                        <span key={tag} className="tag-badge" style={{ background, color }}>
                          <Icon name="tag" size={10} />
                          <span className="tag-chip-text" title={tag}>{tag}</span>
                        </span>
                      );
                    })}
                    {note.tags.length > 3 && (
                      <span className="tag-badge tag-badge--more">+{note.tags.length - 3}</span>
                    )}
                  </div>
                )}
                <div className="note-item-date">
                  <Icon name="clock" size={10} />
                  {formatDate(note.updated_at || note.created_at, language)}
                </div>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <div className="empty-state">
                <div className="icon-wrap">
                  <Icon name="search" size={24} />
                </div>
                <h3>{t.noResultsTitle}</h3>
                <p>{t.noResultsDescription}</p>
              </div>
            )}
          </div>

        </aside>

        <main className="main">
          <div className={`topbar${showTopbarTitle ? "" : " actions-only"}${editing ? " topbar-editing" : ""}`}>
            {showBackButton ? (
              <button
                type="button"
                className="btn-icon"
                onClick={() => {
                  if (editing) {
                    closeEditor();
                    return;
                  }

                  clearRecommendations();
                  setSelectedId(null);
                }}
                title={t.back}
              >
                <Icon name="back" />
              </button>
            ) : (
              isMobile && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setIsSidebarOpen(true)}
                  title={t.menu}
                >
                  <Icon name="menu" />
                </button>
              )
            )}

            {showTopbarTitle && (
              <div className="topbar-title-block">
                <div className="topbar-title">
                  {editing ? (isNew ? t.noteEditorNew : t.noteEditorEdit) : selectedNote?.title || "SmartNotebook"}
                </div>
                <div className="topbar-meta">
                  {editing || !selectedNote ? t.importHint : ""}
                </div>
              </div>
            )}

            <div className="topbar-left">
              <button type="button" className="btn-primary-inline btn-create-note topbar-left-button" onClick={handleNew} title={t.create}>
                <Icon name="plus" size={16} /> <span className="topbar-left-button-label">{!compactTopbar && t.createShort}</span>
              </button>
              <button
                type="button"
                className="btn-secondary topbar-left-button"
                onClick={() => {
                  if (importInputRef.current) {
                    importInputRef.current.value = "";
                    importInputRef.current.click();
                  }
                }}
                disabled={isImporting}
                title={t.importShort}
              >
                <Icon name="upload" size={16} /> <span className="topbar-left-button-label">{!compactTopbar && (isImporting ? t.importInProgress : t.importShort)}</span>
              </button>
              <button type="button" className="btn-secondary topbar-left-button" onClick={handleBackupExport} title={t.backupExport}>
                <Icon name="download" size={16} /> <span className="topbar-left-button-label">{!compactTopbar && t.backupExport}</span>
              </button>
              <button
                type="button"
                className="btn-secondary topbar-left-button"
                onClick={() => backupRestoreInputRef.current?.click()}
                disabled={isRestoringBackup}
                title={t.backupRestore}
              >
                <Icon name="upload" size={16} /> <span className="topbar-left-button-label">{!compactTopbar && t.backupRestore}</span>
              </button>
            </div>

            <div className="topbar-right">
              <div className="topbar-actions">
                {selectedNote && !editing && (
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setEditing(true)}
                      title={t.edit}
                    >
                      <Icon name="edit" size={16} />
                      {!compactTopbar && t.edit}
                    </button>
                    <div className="toolbar-group">
                      <button
                        type="button"
                        className="btn-ghost-inline"
                        onClick={() => handleExport("txt")}
                        title={`${t.exportMenuTitle} TXT`}
                      >
                        {!compactTopbar && <Icon name="download" size={15} />}
                        {t.exportTxt}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost-inline"
                        onClick={() => handleExport("md")}
                        title={`${t.exportMenuTitle} MD`}
                      >
                        {!compactTopbar && <Icon name="download" size={15} />}
                        {t.exportMd}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost-inline"
                        onClick={() => handleExport("pdf")}
                        title={`${t.exportMenuTitle} PDF`}
                      >
                        {!compactTopbar && <Icon name="download" size={15} />}
                        {t.exportPdf}
                      </button>
                    </div>
                    <button type="button" className="btn-icon danger" onClick={handleDelete} title={t.delete}>
                      <Icon name="trash" />
                    </button>
                  </div>
                )}

                {!editing && (
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className={`btn-icon${viewMode === "list" ? " active" : ""}`}
                      onClick={() => handleViewChange("list")}
                      title={t.listView}
                    >
                      <Icon name="list" />
                    </button>
                    <button
                      type="button"
                      className={`btn-icon${viewMode === "grid" ? " active" : ""}`}
                      onClick={() => handleViewChange("grid")}
                      title={t.gridView}
                    >
                      <Icon name="grid" />
                    </button>
                  </div>
                )}

                <div className="topbar-settings" ref={optionsMenuRef}>
                  <button
                    type="button"
                    className={`btn-icon options-button${isOptionsOpen ? " active" : ""}`}
                    onClick={() => setIsOptionsOpen((current) => !current)}
                    title={t.optionsLabel}
                    aria-label={t.optionsLabel}
                    aria-haspopup="menu"
                    aria-expanded={isOptionsOpen}
                  >
                    <Icon name="settings" size={16} />
                  </button>
                  {isOptionsOpen ? (
                    <div className="options-menu" role="menu" aria-label={t.optionsLabel}>
                      <div className="options-section">
                        <div className="options-section-label">{t.textSizeLabel}</div>
                        <FontSizeSwitch
                          value={noteFontSize}
                          onChange={(value) => setNoteFontSize(getConstrainedNoteFontSize(value, window.innerWidth))}
                          t={t}
                          maxSize={maxNoteFontSize}
                        />
                      </div>
                      <div className="options-section">
                        <div className="options-section-label">{t.languageLabel}</div>
                        <LanguageSwitch language={language} onChange={setLanguage} t={t} />
                      </div>
                      <div className="options-section">
                        <div className="options-section-label">{t.themeLabel}</div>
                        <ThemeSwitch theme={theme} onChange={setTheme} t={t} compact={false} />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="content-area" style={{ "--note-font-size": `${noteFontSize}px` }}>
            {errorMessage && (
              <div className="error-state">
                <div className="error-banner">{errorMessage}</div>
              </div>
            )}

            {editing ? (
              <NoteEditor
                key={isNew ? "new-note" : selectedNote?.id || "editor"}
                note={isNew ? null : selectedNote}
                onSave={handleSave}
                onCancel={closeEditor}
                isSaving={isSaving}
                onNotify={showToast}
                t={t}
                theme={theme}
              />
            ) : selectedNote ? (
              <NoteView
                note={selectedNote}
                recommendations={recommendations}
                onSelectNote={openNote}
                onToggleChecklist={handleChecklistToggle}
                t={t}
                language={language}
                theme={theme}
                contentRef={noteContentRef}
              />
            ) : filteredNotes.length === 0 ? (
              <div className="empty-state">
                <div className="icon-wrap">
                  <Icon name={notesList.length === 0 ? "book" : "search"} size={30} />
                </div>
                <h3>{notesList.length === 0 ? t.noNotesTitle : t.noResultsTitle}</h3>
                <p>
                  {notesList.length === 0
                    ? t.noNotesDescription
                    : activeTag
                      ? t.noTagNotesDescription(activeTag)
                      : t.noResultsDescription}
                </p>
                {notesList.length === 0 && (
                  <button
                    type="button"
                    className="btn-primary-inline"
                    onClick={handleNew}
                  >
                    <Icon name="plus" size={15} /> {t.createEmptyButton}
                  </button>
                )}
                {notesList.length > 0 && activeTag && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActiveTag(null)}
                  >
                    {t.clearTagFilter}
                  </button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <NotesGridContent
                notes={filteredNotes}
                onSelectNote={openNote}
                t={t}
                language={language}
                theme={theme}
              />
            ) : (
              <NotesListContent
                notes={filteredNotes}
                onSelectNote={openNote}
                t={t}
                language={language}
                theme={theme}
              />
            )}
          </div>
        </main>
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "success" ? <Icon name="check" size={15} /> : "!"}
          {toast.message}
        </div>
      )}
    </>
  );
}
