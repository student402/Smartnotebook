import { formatDate } from "./date";

export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function makeFileName(title, extension) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "note";

  return `${normalized}.${extension}`;
}

export function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getExportMetadata(note, language, t) {
  return {
    id: note.id,
    title: note.title,
    tags: note.tags || [],
    createdAt: note.created_at || "",
    updatedAt: note.updated_at || "",
    createdAtLabel: formatDate(note.created_at, language),
    updatedAtLabel: formatDate(note.updated_at, language),
    emptyText: t.noteEmpty,
  };
}

export function exportNoteAsTxt(note, language, t) {
  const metadata = getExportMetadata(note, language, t);
  const tagsLine = metadata.tags.length > 0 ? metadata.tags.join(", ") : "-";

  triggerDownload(
    makeFileName(note.title, "txt"),
    [
      `Title: ${metadata.title}`,
      `Note ID: ${metadata.id}`,
      `Created: ${metadata.createdAtLabel || metadata.createdAt || "-"}`,
      `Updated: ${metadata.updatedAtLabel || metadata.updatedAt || "-"}`,
      `Tags: ${tagsLine}`,
      "",
      "---",
      "",
      note.content || metadata.emptyText,
      "",
    ].join("\n"),
    "text/plain;charset=utf-8"
  );
}

export function exportNoteAsMarkdown(note, language, t) {
  const metadata = getExportMetadata(note, language, t);
  const frontMatterTags = metadata.tags.map((tag) => `  - "${tag.replaceAll('"', '\\"')}"`).join("\n");

  triggerDownload(
    makeFileName(note.title, "md"),
    [
      "---",
      `id: ${metadata.id}`,
      `title: "${metadata.title.replaceAll('"', '\\"')}"`,
      `created_at: "${metadata.createdAt || ""}"`,
      `updated_at: "${metadata.updatedAt || ""}"`,
      "tags:",
      frontMatterTags || "  []",
      "---",
      "",
      `# ${metadata.title}`,
      "",
      `- Created: ${metadata.createdAtLabel || metadata.createdAt || "-"}`,
      `- Updated: ${metadata.updatedAtLabel || metadata.updatedAt || "-"}`,
      `- Tags: ${metadata.tags.length > 0 ? metadata.tags.join(", ") : "-"}`,
      "",
      note.content || metadata.emptyText,
      "",
    ].join("\n"),
    "text/markdown;charset=utf-8"
  );
}

export function getPrintableNoteHtml(note, renderedContent, t) {
  if (!renderedContent) {
    return `<p>${escapeHtml(note.content || t.noteEmpty)}</p>`;
  }

  const clone = renderedContent.cloneNode(true);

  clone.querySelectorAll(".note-table-tools").forEach((element) => element.remove());
  clone.querySelectorAll("button").forEach((button) => {
    if (button.classList.contains("youtube-preview-card")) {
      const fallback = document.createElement("div");
      fallback.className = "youtube-preview-card";
      fallback.innerHTML = button.innerHTML;
      button.replaceWith(fallback);
      return;
    }

    if (button.classList.contains("note-table-tool")) {
      button.remove();
    }
  });

  clone.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    if (input.checked) {
      input.setAttribute("checked", "checked");
    } else {
      input.removeAttribute("checked");
    }
    input.setAttribute("disabled", "disabled");
  });

  clone.querySelectorAll("iframe.youtube-player").forEach((iframe) => {
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-video-fallback";

    const link = document.createElement("a");
    const source = iframe.getAttribute("src") || "";
    link.href = source.replace("/embed/", "/watch?v=").split("?")[0];
    link.textContent = link.href;
    link.target = "_blank";
    link.rel = "noreferrer";

    wrapper.textContent = "Video: ";
    wrapper.appendChild(link);
    iframe.replaceWith(wrapper);
  });

  return clone.innerHTML || `<p>${escapeHtml(note.content || t.noteEmpty)}</p>`;
}

export function exportNoteAsPdf(note, language, t, renderedContent) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) {
    return false;
  }

  const metadata = getExportMetadata(note, language, t);
  const title = escapeHtml(metadata.title);
  const tags = metadata.tags.length > 0
    ? `<div style="margin:0 0 18px;display:flex;flex-wrap:wrap;gap:8px;">${metadata.tags
      .map((tag) => `<span style="padding:4px 10px;border:1px solid #d6c7ab;border-radius:999px;color:#8a6a36;font:600 12px 'DM Sans', sans-serif;">${escapeHtml(tag)}</span>`)
      .join("")}</div>`
    : "";
  const metaTable = `
    <div style="margin:0 0 22px;padding:16px 18px;border:1px solid #eadfc8;border-radius:14px;background:#faf6ee;">
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px 14px;font:14px/1.6 'DM Sans', sans-serif;color:#4d4030;">
        <strong>Note ID</strong><span>${metadata.id}</span>
        <strong>Created</strong><span>${escapeHtml(metadata.createdAtLabel || metadata.createdAt || "-")}</span>
        <strong>Updated</strong><span>${escapeHtml(metadata.updatedAtLabel || metadata.updatedAt || "-")}</span>
        <strong>Tags</strong><span>${escapeHtml(metadata.tags.length > 0 ? metadata.tags.join(", ") : "-")}</span>
      </div>
    </div>
  `;

  popup.document.write(`
    <html lang="en">
      <head>
        <title>${title} - ${escapeHtml(t.printTitleSuffix)}</title>
        <style>
          body {
            margin: 48px;
            color: #1f1720;
            font-family: 'DM Sans', sans-serif;
            line-height: 1.7;
          }
          h1 {
            margin: 0 0 18px;
            font-size: 34px;
            font-family: 'Plus Jakarta Sans', sans-serif;
          }
          .pdf-note-body {
            font-size: 16px;
            line-height: 1.8;
          }
          .pdf-note-body h1,
          .pdf-note-body h2,
          .pdf-note-body h3,
          .pdf-note-body h4 {
            font-family: 'Plus Jakarta Sans', sans-serif;
            line-height: 1.2;
            margin: 1.2em 0 0.5em;
          }
          .pdf-note-body h1 { font-size: 26px; }
          .pdf-note-body h2 { font-size: 22px; }
          .pdf-note-body h3 { font-size: 19px; }
          .pdf-note-body h4 { font-size: 17px; }
          .pdf-note-body p,
          .pdf-note-body ul,
          .pdf-note-body ol,
          .pdf-note-body blockquote,
          .pdf-note-body figure,
          .pdf-note-body table,
          .pdf-note-body pre {
            margin: 0 0 1em;
          }
          .pdf-note-body img,
          .pdf-note-body iframe {
            max-width: 100%;
            border-radius: 14px;
          }
          .pdf-note-body a {
            color: #8d6324;
            text-decoration: none;
          }
          .pdf-note-body .rich-link-card {
            display: grid;
            grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
            gap: 14px;
            align-items: stretch;
            border: 1px solid #d8ccbb;
            border-radius: 18px;
            overflow: hidden;
            color: inherit;
            text-decoration: none;
            background: #faf6ee;
          }
          .pdf-note-body .rich-link-image {
            display: block;
            width: 100%;
            height: 100%;
            min-height: 150px;
            object-fit: cover;
          }
          .pdf-note-body .rich-link-copy {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 16px;
            min-width: 0;
          }
          .pdf-note-body .rich-link-title {
            font: 700 18px/1.35 'Plus Jakarta Sans', sans-serif;
          }
          .pdf-note-body .rich-link-site,
          .pdf-note-body .rich-link-url {
            color: #74614a;
            font-size: 13px;
            word-break: break-word;
          }
          .pdf-note-body .rich-link-description {
            color: #3f3327;
          }
          .pdf-note-body .youtube-preview-card,
          .pdf-note-body .youtube-player-wrap {
            display: block;
            overflow: hidden;
            border: 1px solid #d8ccbb;
            border-radius: 18px;
            background: #111;
          }
          .pdf-note-body .youtube-preview-image {
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
          }
          .pdf-note-body .youtube-preview-overlay {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 18px;
            color: #fff;
            background: rgba(15, 15, 19, 0.72);
          }
          .pdf-note-body .youtube-preview-play {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.22);
          }
          .pdf-note-body .youtube-preview-label {
            font-weight: 700;
          }
          .pdf-note-body .pdf-video-fallback {
            padding: 16px 18px;
            background: #faf6ee;
            border: 1px solid #d8ccbb;
            border-radius: 14px;
          }
          .pdf-note-body table {
            width: 100%;
            border-collapse: collapse;
          }
          .pdf-note-body th,
          .pdf-note-body td {
            border: 1px solid #d8ccbb;
            padding: 10px 12px;
            text-align: left;
            vertical-align: top;
          }
          .pdf-note-body blockquote {
            padding-left: 16px;
            border-left: 3px solid #a5762b;
            color: #5a4b3c;
          }
          .pdf-note-body pre {
            white-space: pre-wrap;
            word-break: break-word;
            padding: 14px 16px;
            border: 1px solid #d8ccbb;
            background: #faf6ee;
          }
          .pdf-note-body input[type="checkbox"] {
            accent-color: #a5762b;
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${metaTable}
        ${tags}
        <div class="pdf-note-body">${getPrintableNoteHtml(note, renderedContent, t)}</div>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
