export function stripFrontmatter(markdown) {
    if (!markdown.startsWith('---')) {
        return markdown;
    }
    const endIndex = markdown.indexOf('\n---', 3);
    if (endIndex === -1) {
        return markdown;
    }
    const afterEnd = markdown.indexOf('\n', endIndex + 4);
    return afterEnd === -1 ? '' : markdown.slice(afterEnd + 1);
}
function splitTopLevelSections(markdown) {
    const sections = [];
    let current = {
        heading: null,
        lines: []
    };
    for (const line of markdown.split(/\r?\n/)) {
        const heading = /^#\s+(.+)$/.exec(line.trim());
        if (heading) {
            sections.push(current);
            current = {
                heading: heading[1].trim(),
                lines: [line]
            };
            continue;
        }
        current.lines.push(line);
    }
    sections.push(current);
    return sections.filter((section) => section.heading || section.lines.some((line) => line.trim()));
}
function isPlaceholderLine(line) {
    const text = line.trim();
    return text === '_无划线_' || text === '_无章节评论_' || text === '_无书评_' || text === '_空评论_';
}
function meaningfulLines(section) {
    return section.lines
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => line && !isPlaceholderLine(line));
}
function isEmptyDemoSection(section) {
    if (!section.heading || section.heading === '元数据') {
        return false;
    }
    const lines = meaningfulLines(section);
    if (lines.length === 0) {
        return true;
    }
    if (section.heading.includes('划线评论') || section.heading.includes('章节 / 划线评论')) {
        return !lines.some((line) => /^>\s*📌/.test(line));
    }
    return false;
}
function isHighlightQuote(line) {
    return /^>\s*📌/.test(line);
}
function isCommentQuote(line) {
    return /^>\s*💭/.test(line);
}
function isTimeQuote(line) {
    return /^>\s*⏱/.test(line);
}
function lastNonEmptyLine(lines) {
    return [...lines].reverse().find((line) => line.trim())?.trim() ?? '';
}
function nextNonEmptyLine(lines, startIndex) {
    return lines.slice(startIndex).find((line) => line.trim())?.trim() ?? '';
}
function convertLegacyCommentLine(text) {
    const comment = /^-\s*💭\s*(.*)$/.exec(text);
    if (comment) {
        return `> 💭 ${comment[1]}`;
    }
    const time = /^-\s*⏱\s*(.*)$/.exec(text);
    if (time) {
        return `> ⏱ ${time[1]}`;
    }
    return null;
}
function normalizeSectionForDemo(section) {
    if (!section.heading?.includes('划线评论') && !section.heading?.includes('章节 / 划线评论')) {
        return section;
    }
    const lines = [];
    for (let index = 0; index < section.lines.length; index += 1) {
        const line = section.lines[index];
        const text = line.trim();
        if (!text) {
            const previous = lastNonEmptyLine(lines);
            const next = nextNonEmptyLine(section.lines, index + 1);
            if (isHighlightQuote(previous) && (/^-\s*💭/.test(next) || isCommentQuote(next))) {
                continue;
            }
            lines.push(line);
            continue;
        }
        if (isTimeQuote(text)) {
            const previous = lastNonEmptyLine(lines);
            if (!isCommentQuote(previous)) {
                continue;
            }
        }
        const convertedLine = convertLegacyCommentLine(text);
        if (convertedLine) {
            lines.push(convertedLine);
            continue;
        }
        lines.push(line);
    }
    return {
        ...section,
        lines
    };
}
export function prepareMarkdownForDemo(markdown) {
    const body = stripFrontmatter(markdown);
    const sections = splitTopLevelSections(body)
        .filter((section) => !isEmptyDemoSection(section))
        .map(normalizeSectionForDemo);
    return sections.map((section) => section.lines.join('\n').trim()).filter(Boolean).join('\n\n');
}
export function markdownHasDisplayContent(markdown) {
    const sections = splitTopLevelSections(prepareMarkdownForDemo(markdown));
    return sections.some((section) => {
        if (!section.heading || section.heading === '元数据') {
            return false;
        }
        return meaningfulLines(section).length > 0;
    });
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function renderInline(value) {
    const withoutAnchors = value.replace(/\s+\^[a-zA-Z0-9_-]+/g, '');
    const escaped = escapeHtml(withoutAnchors);
    return escaped
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
export function renderMarkdownToHtml(markdown) {
    const lines = prepareMarkdownForDemo(markdown).split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let inList = false;
    let inQuote = false;
    const closeList = () => {
        if (inList) {
            html.push('</ul>');
            inList = false;
        }
    };
    const closeQuote = () => {
        if (inQuote) {
            html.push('</blockquote>');
            inQuote = false;
        }
    };
    const flushParagraph = () => {
        if (paragraph.length === 0) {
            return;
        }
        closeList();
        closeQuote();
        html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
        paragraph = [];
    };
    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.trim()) {
            flushParagraph();
            closeList();
            closeQuote();
            continue;
        }
        const heading = /^(#{1,4})\s+(.+)$/.exec(line);
        if (heading) {
            flushParagraph();
            closeList();
            closeQuote();
            const level = Math.min(heading[1].length + 1, 5);
            html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
            continue;
        }
        const quote = /^>\s?(.*)$/.exec(line);
        if (quote) {
            flushParagraph();
            closeList();
            if (!inQuote) {
                html.push('<blockquote>');
                inQuote = true;
            }
            if (quote[1].trim()) {
                html.push(`<p>${renderInline(quote[1])}</p>`);
            }
            continue;
        }
        const listItem = /^\s*-\s+(.+)$/.exec(line);
        if (listItem) {
            flushParagraph();
            closeQuote();
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            html.push(`<li>${renderInline(listItem[1])}</li>`);
            continue;
        }
        closeList();
        closeQuote();
        paragraph.push(line.trim());
    }
    flushParagraph();
    closeList();
    closeQuote();
    return html.join('\n');
}
