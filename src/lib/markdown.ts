type BookInfoShape = {
  bookId?: string;
  title?: string;
  author?: string;
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

function groupHighlightsByChapter(bookmarks: BookmarkListShape, reviews: ReviewListShape) {
  const chapterMap = new Map<number, { chapterIdx: number; chapterTitle: string; items: Array<{ highlight: BookmarkItem; review?: ReviewItem['review'] }> }>();
  const reviewItems = (reviews.reviews ?? []).map((item) => item.review).filter(Boolean);

  for (const highlight of bookmarks.updated ?? []) {
    const chapterInfo = (bookmarks.chapters ?? []).find(
      (chapter) => chapter.chapterUid === highlight.chapterUid
    );
    const chapterUid = highlight.chapterUid ?? -1;
    const existing = chapterMap.get(chapterUid) ?? {
      chapterIdx: chapterInfo?.chapterIdx ?? chapterUid,
      chapterTitle: chapterInfo?.title ?? `Chapter ${chapterUid}`,
      items: []
    };

    const matchedReview = reviewItems.find(
      (review) => review?.chapterUid === highlight.chapterUid && review?.range === highlight.range
    );

    existing.items.push({
      highlight,
      review: matchedReview
    });
    chapterMap.set(chapterUid, existing);
  }

  return [...chapterMap.values()].sort((left, right) => left.chapterIdx - right.chapterIdx);
}

function renderHighlights(bookmarks: BookmarkListShape, reviews: ReviewListShape): string {
  const chapters = groupHighlightsByChapter(bookmarks, reviews);
  if (chapters.length === 0) {
    return '_无划线_';
  }

  const lines: string[] = [];
  for (const chapter of chapters) {
    lines.push(`## ${chapter.chapterTitle}`);
    lines.push('');
    for (const item of chapter.items) {
      const bookmarkId = item.highlight.bookmarkId?.replace(/[_~]/g, '-');
      lines.push(`> 📌 ${toMarkdownSafeText(item.highlight.markText)}${bookmarkId ? ` ^${bookmarkId}` : ''}`);
      lines.push(`> ⏱ ${formatTimestamp(item.highlight.createTime)}`);
      if (item.review?.content) {
        lines.push('');
        lines.push(`- 💭 ${toMarkdownSafeText(item.review.content)}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

function renderChapterReviews(reviews: ReviewListShape): string {
  const chapterReviews = (reviews.reviews ?? [])
    .map((item) => item.review)
    .filter((review) => review && review.type === 1);

  if (chapterReviews.length === 0) {
    return '_无章节评论_';
  }

  return chapterReviews
    .map((review) => {
      const reviewId = review?.reviewId?.replace(/[_~]/g, '-');
      return [
        `- ${toMarkdownSafeText(review?.content)}${reviewId ? ` ^${reviewId}` : ''}`,
        `  - ⏱ ${formatTimestamp(review?.createTime)}`
      ].join('\n');
    })
    .join('\n\n');
}

function renderBookReviews(reviews: ReviewListShape): string {
  const bookReviews = (reviews.reviews ?? [])
    .map((item) => item.review)
    .filter((review) => review && review.type === 4);

  if (bookReviews.length === 0) {
    return '_无书评_';
  }

  return bookReviews
    .map((review, index) => {
      const reviewId = review?.reviewId?.replace(/[_~]/g, '-');
      return [
        `## 书评 ${index + 1}`,
        '',
        `${toMarkdownSafeText(review?.content)}${reviewId ? ` ^${reviewId}` : ''}`,
        '',
        `⏱ ${formatTimestamp(review?.createTime)}`
      ].join('\n');
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
  const frontmatter = [
    '---',
    `doc_type: "weread-sync-note"`,
    `source: "weread"`,
    `bookId: ${yamlEscape(input.bookInfo.bookId ?? '')}`,
    `title: ${yamlEscape(input.bookInfo.title ?? '')}`,
    `author: ${yamlEscape(input.bookInfo.author ?? '')}`,
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
    `- 简介：${intro}`,
    '',
    '# 高亮划线',
    '',
    renderHighlights(input.bookmarks, input.reviews),
    '',
    '# 章节 / 划线评论',
    '',
    renderChapterReviews(input.reviews),
    '',
    '# 书评',
    '',
    renderBookReviews(input.reviews)
  ];

  return [...frontmatter, ...body].join('\n').trimEnd() + '\n';
}
