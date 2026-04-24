const app = document.querySelector('#app');
const syncStateNode = document.querySelector('[data-sync-state]');
const loginButton = document.querySelector('[data-login]');
const syncButton = document.querySelector('[data-sync]');
const homeButton = document.querySelector('[data-home]');
const APP_TITLE = '微信读书评论';

let appState = null;
let catalog = null;
let busy = false;
let toastTimer = null;

function setView(view) {
  document.body.dataset.view = view;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    const message = payload.error?.message ?? `Request failed: ${response.status}`;
    const error = new Error(message);
    error.code = payload.error?.code;
    throw error;
  }
  return payload;
}

function statusLabel(status) {
  if (status === 'reading') {
    return '在读';
  }
  if (status === 'finished') {
    return '已读';
  }
  return '其他';
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function progressText(book) {
  if (typeof book.progress === 'number') {
    return `${book.progress}%`;
  }
  return statusLabel(book.status);
}

function routeBookPath(bookId) {
  return `/books/${encodeURIComponent(bookId)}`;
}

function currentBookId() {
  const match = /^\/books\/([^/]+)$/.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function navigate(path) {
  window.history.pushState({}, '', path);
  void renderRoute();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  toastTimer = window.setTimeout(() => node.remove(), 3200);
}

function setBusy(value) {
  busy = value;
  syncButton.disabled = value;
  loginButton.disabled = value;
}

function updateHeader() {
  const state = appState;
  const authReady = Boolean(state?.authenticated && state.authValid !== false);
  loginButton.hidden = authReady;
  loginButton.textContent = state?.authValid === false ? '重新登录' : '登录';
  syncButton.hidden = !state?.hasCache;
  syncStateNode.textContent =
    state?.hasCache && state.lastSyncAt
      ? `${state.bookCount} 本 · ${formatDate(state.lastSyncAt)}`
      : '';
}

async function refreshState() {
  const payload = await api('/api/state');
  appState = payload.state;
  updateHeader();
  return appState;
}

async function loadCatalog() {
  const payload = await api('/api/books');
  catalog = payload.catalog;
  return catalog;
}

async function checkAuthIfCoversMissing(books) {
  const missingCoverCount = books.filter((book) => !book.coverPath).length;
  if (!appState?.authenticated || appState.authValid === false || missingCoverCount === 0) {
    return;
  }

  const payload = await api('/api/auth/check');
  appState = {
    ...appState,
    authValid: payload.auth.valid,
    authIssue: payload.auth.reason
  };
  updateHeader();
}

function renderLoading(text = '加载中...') {
  setView('loading');
  app.className = 'main';
  app.innerHTML = `<section class="panel"><p class="loading-line">${escapeHtml(text)}</p></section>`;
}

function renderSyncLoading() {
  setView('loading');
  app.className = 'main';
  app.innerHTML = `
    <section class="panel loading-panel">
      <div class="loader" aria-hidden="true"></div>
      <h1>正在同步</h1>
      <p class="loading-line" data-sync-progress>正在拉取书籍、划线、书评和封面。</p>
      <div class="sync-steps" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </section>
  `;
}

function renderEmptyState(state) {
  setView('home');
  app.className = 'main';
  if (state.authenticated) {
    app.innerHTML = `
      <section class="panel">
        <h1>还没有本地缓存</h1>
        <p>当前已登录，可以先同步一次书籍和笔记。</p>
        <button class="text-button primary" type="button" data-start-sync>同步书架</button>
      </section>
    `;
    app.querySelector('[data-start-sync]')?.addEventListener('click', () => void startSync(false));
    return;
  }

  app.innerHTML = `
    <section class="panel">
      <h1>登录微信读书</h1>
      <p>本地还没有可展示的缓存。扫码登录后会自动同步，并在这里展示书籍列表。</p>
      <button class="text-button primary" type="button" data-start-login>显示二维码</button>
    </section>
  `;
  app.querySelector('[data-start-login]')?.addEventListener('click', () => void startLogin(true));
}

function renderHomeGrid(books) {
  setView('home');
  document.title = APP_TITLE;
  const shouldShowAuthNotice =
    appState?.authValid === false && books.some((book) => !book.coverPath);
  app.className = 'main home';
  app.innerHTML = `
    ${shouldShowAuthNotice ? `
      <section class="notice">
        <span>登录已失效，重新扫码后会同步封面和最新笔记。</span>
        <button class="text-button primary" type="button" data-start-login>重新登录</button>
      </section>
    ` : ''}
    <section class="book-grid">
      ${books.map((book) => `
        <a class="book-card" href="${routeBookPath(book.bookId)}" data-book-id="${escapeHtml(book.bookId)}">
          <div class="cover-wrap">
            <img src="/api/books/${encodeURIComponent(book.bookId)}/cover" alt="${escapeHtml(book.title)}" loading="lazy" />
          </div>
          <div class="card-body">
            <h2 class="book-title">${escapeHtml(book.title)}</h2>
            <p class="book-author">${escapeHtml(book.author || '未知作者')}</p>
            <div class="book-meta">
              <span class="status-badge">${escapeHtml(statusLabel(book.status))}</span>
              <span>${escapeHtml(progressText(book))}</span>
            </div>
          </div>
        </a>
      `).join('')}
    </section>
  `;

  app.querySelector('[data-start-login]')?.addEventListener('click', () => void startLogin(true));

  app.querySelectorAll('[data-book-id]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(routeBookPath(node.dataset.bookId));
    });
  });
}

async function renderHome() {
  renderLoading();
  const state = await refreshState();
  if (!state.hasCache) {
    renderEmptyState(state);
    return;
  }

  const nextCatalog = await loadCatalog();
  await checkAuthIfCoversMissing(nextCatalog.books);
  renderHomeGrid(nextCatalog.books);
}

function renderSidebar(books, activeBookId) {
  return `
    <aside class="detail-sidebar">
      <button class="side-brand" type="button" data-route-home>${APP_TITLE}</button>
      <button class="back-button" type="button" data-route-home>返回列表</button>
      <div class="detail-side-list">
        ${books.map((book) => `
          <button class="side-book ${book.bookId === activeBookId ? 'active' : ''}" type="button" data-side-book="${escapeHtml(book.bookId)}">
            ${escapeHtml(book.title)}
          </button>
        `).join('')}
      </div>
    </aside>
  `;
}

async function renderDetail(bookId) {
  setView('detail');
  renderLoading();
  await refreshState();
  const [bookPayload, nextCatalog] = await Promise.all([
    api(`/api/books/${encodeURIComponent(bookId)}`),
    loadCatalog()
  ]);
  const book = bookPayload.book;
  document.title = `${book.title} - ${APP_TITLE}`;

  app.className = 'main detail';
  setView('detail');
  app.innerHTML = `
    <section class="detail-layout">
      ${renderSidebar(nextCatalog.books, book.bookId)}
      <article class="article">
        <div class="article-top">
          <button class="article-brand" type="button" data-route-home>${APP_TITLE}</button>
          <button class="back-button" type="button" data-route-home>返回列表</button>
        </div>
        <h1>${escapeHtml(book.title)}</h1>
        <div class="article-meta">
          ${escapeHtml([book.author, statusLabel(book.status), formatDate(book.syncedAt)].filter(Boolean).join(' · '))}
        </div>
        <div class="article-body">${bookPayload.html}</div>
      </article>
      <div class="right-space"></div>
    </section>
  `;

  app.querySelectorAll('[data-route-home]').forEach((node) => {
    node.addEventListener('click', () => navigate('/'));
  });

  app.querySelectorAll('[data-side-book]').forEach((node) => {
    node.addEventListener('click', () => navigate(routeBookPath(node.dataset.sideBook)));
  });
}

async function renderRoute() {
  try {
    const bookId = currentBookId();
    if (bookId) {
      await renderDetail(bookId);
      return;
    }
    await renderHome();
  } catch (error) {
    app.className = 'main';
    app.innerHTML = `
      <section class="panel">
        <h1>页面加载失败</h1>
        <p>${escapeHtml(error.message)}</p>
        <button class="text-button primary" type="button" data-route-home>返回列表</button>
      </section>
    `;
    app.querySelector('[data-route-home]')?.addEventListener('click', () => navigate('/'));
  }
}

async function startLogin(syncAfterLogin) {
  if (busy) {
    return;
  }

  setBusy(true);
  app.className = 'main';
  app.innerHTML = `
    <section class="panel">
      <h1>正在生成二维码</h1>
      <p class="loading-line">请稍等。</p>
    </section>
  `;

  try {
    const payload = await api('/api/login/start', {
      method: 'POST',
      body: '{}'
    });

    app.innerHTML = `
      <section class="panel">
        <h1>扫码登录</h1>
        <p>请用微信扫码确认登录，成功后会自动继续。</p>
        <div class="qr-box">
          <img src="${payload.qrDataUrl}" alt="微信读书登录二维码" />
        </div>
        <p class="loading-line">等待扫码中...</p>
      </section>
    `;

    while (true) {
      const poll = await api(`/api/login/poll?uid=${encodeURIComponent(payload.uid)}`);
      if (poll.status === 'logged-in') {
        showToast('登录成功');
        await refreshState();
        setBusy(false);
        if (syncAfterLogin) {
          await startSync(false);
        } else {
          await renderRoute();
        }
        return;
      }
      await delay(1000);
    }
  } catch (error) {
    showToast(error.message);
    setBusy(false);
    await renderRoute();
  }
}

async function pollJob(jobId) {
  const startedAt = Date.now();
  while (true) {
    const payload = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    const job = payload.job;
    if (job.status === 'done') {
      return job;
    }
    if (job.status === 'error') {
      const error = new Error(job.error?.message ?? '同步失败');
      error.code = job.error?.code;
      throw error;
    }
    const progress = document.querySelector('[data-sync-progress]');
    if (progress) {
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      progress.textContent = `同步进行中，已用时 ${elapsedSeconds} 秒。封面会写入本地缓存。`;
    }
    await delay(1600);
  }
}

async function startSync(force) {
  if (busy) {
    return;
  }

  if (!appState?.authenticated || appState.authValid === false) {
    await startLogin(true);
    return;
  }

  setBusy(true);
  renderSyncLoading();

  try {
    const payload = await api('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ force })
    });
    await pollJob(payload.job.id);
    catalog = null;
    await refreshState();
    showToast('同步完成');
    setBusy(false);
    await renderRoute();
  } catch (error) {
    if (error.code === 'AUTH_EXPIRED' || error.code === 'NOT_LOGGED_IN') {
      showToast('登录已失效，请重新扫码');
      appState = {
        ...(appState ?? {}),
        authenticated: false
      };
      updateHeader();
      setBusy(false);
      await startLogin(true);
      return;
    }
    showToast(error.message);
    setBusy(false);
    await renderRoute();
  }
}

homeButton.addEventListener('click', () => navigate('/'));
loginButton.addEventListener('click', () => void startLogin(Boolean(appState?.hasCache)));
syncButton.addEventListener('click', () => void startSync(false));
window.addEventListener('popstate', () => void renderRoute());

void renderRoute();
