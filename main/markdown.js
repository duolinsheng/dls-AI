(function () {
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeUrl(url) {
    const trimmed = String(url || "").trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
    return "#";
  }

  function renderInline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safeHref = sanitizeUrl(href);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    return out;
  }

  function isTableRow(line) {
    return /^\s*\|.+\|\s*$/.test(line);
  }

  function isTableSeparator(line) {
    return /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(line);
  }

  function parseTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function renderTable(lines) {
    if (lines.length < 2 || !isTableSeparator(lines[1])) return null;
    const headers = parseTableRow(lines[0]);
    const rows = lines.slice(2).map(parseTableRow);
    const thead = `<thead><tr>${headers.map((h) => `<th>${renderInline(h)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
      .join("")}</tbody>`;
    return `<table class="md-table">${thead}${tbody}</table>`;
  }

  function renderMarkdown(source) {
    const text = String(source || "");
    if (!text.trim()) return "";

    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        i += 1;
        const codeLines = [];
        while (i < lines.length && !/^```/.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        const codeClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        html.push(`<pre><code${codeClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
      }

      if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const tableLines = [line];
        i += 1;
        tableLines.push(lines[i]);
        i += 1;
        while (i < lines.length && isTableRow(lines[i])) {
          tableLines.push(lines[i]);
          i += 1;
        }
        const tableHtml = renderTable(tableLines);
        if (tableHtml) {
          html.push(tableHtml);
          continue;
        }
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
          i += 1;
        }
        html.push(`<blockquote>${renderInline(quoteLines.join(" "))}</blockquote>`);
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ""));
          i += 1;
        }
        html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ""));
          i += 1;
        }
        html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
        continue;
      }

      const paragraphLines = [];
      while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) {
        paragraphLines.push(lines[i]);
        i += 1;
      }
      html.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
    }

    return html.join("");
  }

  window.renderMarkdown = renderMarkdown;
})();
