type BookInfoShape = {
  bookId?: string;
  title?: string;
  author?: string;
  cover?: string;
  coverUrl?: string;
  category?: string;
  publisher?: string;
  isbn?: string;
  intro?: string;
};

type ProgressShape = {
  book?: {
    progress?: number;
    readingTime?: number;
    startReadingTime?: number;
    finishTime?: number;
  };
};

type BookmarkItem = {
  bookmarkId?: string;
  markText?: string;
  range?: string;
  createTime?: number;
  chapterUid?: number;
};

type BookmarkListShape = {
  updated?: BookmarkItem[];
  chapters?: Array<{
    chapterUid?: number;
    chapterIdx?: number;
    title?: string;
  }>;
};

type ReviewItem = {
  review?: {
    reviewId?: string;
    content?: string;
    abstract?: string;
    range?: string;
    createTime?: number;
    chapterUid?: number;
    chapterTitle?: string;
    type?: number;
  };
};

type ReviewListShape = {
  reviews?: ReviewItem[];
};

function formatTimestamp(timestamp?: number | null): string {
  if (!timestamp) {
    return '';
  }

  return new Date(timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function yamlEscape(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function toMarkdownSafeText(value?: string | null): string {
  return (value ?? '').trim();
}

function formatTimeLine(timestamp?: number | null): string {
  const formatted = formatTimestamp(timestamp);
  return formatted ? `> ⏱ ${formatted}` : '';
}

function groupHighlightsByChapter(bookmarks: BookmarkListShape) {
  const chapterMap = new Map<number, { chapterIdx: number; chapterTitle: string; items: BookmarkItem[] }>();
  for (const highlight of bookmarks.updated ?? []) {
    if (!toMarkdownSafeText(highlight.markText)) {
      continue;
    }

    const chapterInfo = (bookmarks.chapters ?? []).find(
      (chapter) => chapter.chapterUid === highlight.chapterUid
    );
    const chapterUid = highlight.chapterUid ?? -1;
    const existing = chapterMap.get(chapterUid) ?? {
      chapterIdx: chapterInfo?.chapterIdx ?? chapterUid,
      chapterTitle: chapterInfo?.title ?? `Chapter ${chapterUid}`,
      items: []
    };

    existing.items.push(highlight);
    chapterMap.set(chapterUid, existing);
  }

  return [...chapterMap.values()].sort((left, right) => left.chapterIdx - right.chapterIdx);
}

function renderHighlights(bookmarks: BookmarkListShape): string {
  const chapters = groupHighlightsByChapter(bookmarks);
  if (chapters.length === 0) {
    return '';
  }

  const lines: string[] = [];
  for (const chapter of chapters) {
    lines.push(`## ${chapter.chapterTitle}`);
    lines.push('');
    for (const highlight of chapter.items) {
      lines.push(`> 📌 ${toMarkdownSafeText(highlight.markText)}`);
      const timeLine = formatTimeLine(highlight.createTime);
      if (timeLine) {
        lines.push(timeLine);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

function findBookmarkForReview(
  review: ReviewItem['review'],
  bookmarks: BookmarkListShape
): BookmarkItem | undefined {
  if (!review) {
    return undefined;
  }

  return (bookmarks.updated ?? []).find((bookmark) => {
    if (review.range && bookmark.range === review.range) {
      return true;
    }

    return Boolean(
      review.chapterUid &&
      bookmark.chapterUid === review.chapterUid &&
      review.abstract &&
      bookmark.markText?.includes(review.abstract)
    );
  });
}

function renderChapterReviews(reviews: ReviewListShape, bookmarks: BookmarkListShape): string {
  const chapterReviews = (reviews.reviews ?? [])
    .map((item) => item.review)
    .filter((review) => review && review.type === 1 && toMarkdownSafeText(review.content));

  if (chapterReviews.length === 0) {
    return '';
  }

  return chapterReviews
    .map((review) => {
      const matchedBookmark = findBookmarkForReview(review, bookmarks);
      const highlightText =
        toMarkdownSafeText(review?.abstract) || toMarkdownSafeText(matchedBookmark?.markText);
      const lines: string[] = [];

      if (highlightText) {
        lines.push(`> 📌 ${highlightText}`);
      }

      lines.push(`> 💭 ${toMarkdownSafeText(review?.content)}`);
      const formattedTime = formatTimestamp(review?.createTime);
      if (formattedTime) {
        lines.push(`> ⏱ ${formattedTime}`);
      }

      return lines.join('\n').trim();
    })
    .join('\n\n');
}

function renderBookReviews(reviews: ReviewListShape): string {
  const bookReviews = (reviews.reviews ?? [])
    .map((item) => item.review)
    .filter((review) => review && review.type === 4 && toMarkdownSafeText(review.content));

  if (bookReviews.length === 0) {
    return '';
  }

  return bookReviews
    .map((review, index) => {
      const lines = [
        `## 书评 ${index + 1}`,
        '',
        toMarkdownSafeText(review?.content)
      ];
      const formattedTime = formatTimestamp(review?.createTime);
      if (formattedTime) {
        lines.push(`⏱ ${formattedTime}`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

export function renderBookMarkdown(input: {
  syncedAt: string;
  bookInfo: BookInfoShape;
  progress: ProgressShape;
  bookmarks: BookmarkListShape;
  reviews: ReviewListShape;
  status: string;
  noteCount: number;
  reviewCount: number;
}): string {
  const progress = input.progress.book?.progress ?? null;
  const intro = (input.bookInfo.intro ?? '').replace(/\r?\n+/g, ' ').trim();
  const highlights = renderHighlights(input.bookmarks);
  const chapterReviews = renderChapterReviews(input.reviews, input.bookmarks);
  const bookReviews = renderBookReviews(input.reviews);
  const frontmatter = [
    '---',
    `doc_type: "weread-sync-note"`,
    `source: "weread"`,
    `bookId: ${yamlEscape(input.bookInfo.bookId ?? '')}`,
    `title: ${yamlEscape(input.bookInfo.title ?? '')}`,
    `author: ${yamlEscape(input.bookInfo.author ?? '')}`,
    `coverUrl: ${yamlEscape(input.bookInfo.coverUrl ?? input.bookInfo.cover ?? '')}`,
    `status: ${yamlEscape(input.status)}`,
    `progress: ${progress === null ? 'null' : progress}`,
    `noteCount: ${input.noteCount}`,
    `reviewCount: ${input.reviewCount}`,
    `lastSyncAt: ${yamlEscape(input.syncedAt)}`,
    '---',
    ''
  ];

  const body = [
    '# 元数据',
    '',
    `- 书名：${input.bookInfo.title ?? ''}`,
    `- 作者：${input.bookInfo.author ?? ''}`,
    `- 分类：${input.bookInfo.category ?? ''}`,
    `- 出版社：${input.bookInfo.publisher ?? ''}`,
    `- ISBN：${input.bookInfo.isbn ?? ''}`,
    `- 阅读状态：${input.status}`,
    `- 阅读进度：${progress === null ? '' : `${progress}%`}`,
    `- 同步时间：${input.syncedAt}`,
    `- 简介：${intro}`
  ];

  if (highlights) {
    body.push('', '# 高亮划线', '', highlights);
  }

  if (chapterReviews) {
    body.push('', '# 划线评论', '', chapterReviews);
  }

  if (bookReviews) {
    body.push('', '# 书评', '', bookReviews);
  }

  return [...frontmatter, ...body].join('\n').trimEnd() + '\n';
}
