// ══════════════════════════════════════════════════════
// DOM 引用
// ══════════════════════════════════════════════════════

const contentEl        = document.getElementById('content');
const totalsEl         = document.getElementById('totals');
const emptyStateEl     = document.getElementById('emptyState');
const filterInput      = document.getElementById('filterInput');
const refreshBtn       = document.getElementById('refreshBtn');
const winTemplate      = document.getElementById('winTemplate');
const rowTemplate      = document.getElementById('rowTemplate');
const bookmarksBarEl   = document.getElementById('bookmarksBar');

const groupPanel       = document.getElementById('groupPanel');
const configBtn        = document.getElementById('configBtn');
const configArea       = document.getElementById('configArea');
const workspaceSelect  = document.getElementById('workspaceSelect');
const saveConfigBtn    = document.getElementById('saveConfigBtn');
const cancelConfigBtn  = document.getElementById('cancelConfigBtn');
const groupList        = document.getElementById('groupList');
const groupEmpty       = document.getElementById('groupEmpty');
const goConfigBtn      = document.getElementById('goConfigBtn');
const groupTemplate    = document.getElementById('groupTemplate');

// ══════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome:' || u.protocol === 'chrome-extension:')
      return u.protocol + u.pathname.replace(/\/$/, '');
    return u.hostname || url;
  } catch { return url; }
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// chrome.storage.local 的 Promise 封装
const store = {
  async get(keys) {
    return new Promise(res => chrome.storage.local.get(keys, res));
  },
  async set(obj) {
    return new Promise(res => chrome.storage.local.set(obj, res));
  },
};

// ══════════════════════════════════════════════════════
// 书签栏（自建）
// ══════════════════════════════════════════════════════

function faviconURL(pageUrl, size = 16) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

function makeBarFallback(text) {
  const span = document.createElement('span');
  span.className = 'fallback';
  span.style.cssText = 'width:13px;height:13px;border-radius:3px;background:var(--border);font-size:8px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);color:var(--muted);flex-shrink:0';
  span.textContent = (text[0] || '?').toUpperCase();
  return span;
}

function bmIconEl(url, title) {
  const img = document.createElement('img');
  img.alt = ''; img.src = faviconURL(url, 16);
  img.onerror = () => img.replaceWith(makeBarFallback(title || url || '?'));
  return img;
}

const FOLDER_SVG = `<svg viewBox="0 0 16 16" class="bm-folder-icon" fill="currentColor">
  <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3z"/>
</svg>`;

function closeAllBmDropdowns() {
  bookmarksBarEl.querySelectorAll('.bm-dropdown').forEach(d => { d.hidden = true; });
}

function buildBookmarkNode(node) {
  const isFolder = node.url === undefined;
  if (!isFolder) {
    const a = document.createElement('a');
    a.className = 'bm-item';
    a.href = node.url;
    a.title = node.title || node.url;
    a.appendChild(bmIconEl(node.url, node.title));
    const label = document.createElement('span');
    label.textContent = node.title || hostOf(node.url);
    a.appendChild(label);
    return a;
  }
  const wrap = document.createElement('div');
  wrap.className = 'bm-folder';

  const labelBtn = document.createElement('button');
  labelBtn.type = 'button'; labelBtn.className = 'bm-folder-label';
  const iconWrap = document.createElement('span');
  iconWrap.innerHTML = FOLDER_SVG;
  labelBtn.appendChild(iconWrap.firstChild);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = node.title || '(未命名)';
  labelBtn.appendChild(nameSpan);
  const caret = document.createElement('span');
  caret.className = 'bm-caret'; caret.textContent = '▾';
  labelBtn.appendChild(caret);
  wrap.appendChild(labelBtn);

  const dropdown = document.createElement('div');
  dropdown.className = 'bm-dropdown'; dropdown.hidden = true;
  if (!node.children?.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:6px 10px;color:var(--muted);font-size:12px';
    empty.textContent = '（空文件夹）';
    dropdown.appendChild(empty);
  } else {
    node.children.forEach(child => dropdown.appendChild(buildBookmarkNode(child)));
  }
  wrap.appendChild(dropdown);

  labelBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = dropdown.hidden;
    closeAllBmDropdowns();
    dropdown.hidden = !willOpen;
  });
  return wrap;
}

async function loadBookmarksBar() {
  try {
    const [tree] = await chrome.bookmarks.getTree();
    // id "1" 是书签栏的固定节点 id（"0"是根，"1"是书签栏，"2"是其他书签）
    const barNode = findNodeById(tree, '1');
    bookmarksBarEl.innerHTML = '';
    (barNode?.children || []).forEach(child =>
      bookmarksBarEl.appendChild(buildBookmarkNode(child)));
  } catch (err) {
    console.error('加载书签栏失败', err);
  }
}

document.addEventListener('click', closeAllBmDropdowns);

// ══════════════════════════════════════════════════════
// 标签舱单
// ══════════════════════════════════════════════════════

let selfTabId = null;
let filterText = '';

async function getSelfTabId() {
  try { const t = await chrome.tabs.getCurrent(); return t?.id ?? null; }
  catch { return null; }
}

async function fetchWindowsSorted() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows
    .filter(w => w.type === 'normal' || w.type === 'popup')
    .sort((a, b) => a.id - b.id);
}

function buildFavicon(container, tab) {
  container.innerHTML = '';
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.alt = ''; img.src = tab.favIconUrl;
    img.onerror = () => { img.remove(); container.appendChild(makeFallbackIcon(tab)); };
    container.appendChild(img);
  } else {
    container.appendChild(makeFallbackIcon(tab));
  }
}

function makeFallbackIcon(tab) {
  const span = document.createElement('span');
  span.className = 'fallback';
  span.textContent = (hostOf(tab.url || '')[0] || '?').toUpperCase();
  return span;
}

function render(windows, filter) {
  contentEl.innerHTML = '';
  let globalSeq = 0, totalTabs = 0, visibleTabs = 0;
  const lf = filter.trim().toLowerCase();

  windows.forEach((win, winIdx) => {
    const tabs = win.tabs || [];
    totalTabs += tabs.length;
    const matchingRows = [];

    tabs.forEach(tab => {
      globalSeq++;
      const title = tab.title || tab.url || '(无标题)';
      const host  = hostOf(tab.url || '');
      if (lf && !title.toLowerCase().includes(lf) && !host.toLowerCase().includes(lf)) return;
      visibleTabs++;

      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      row.dataset.tabId = tab.id;
      row.dataset.windowId = win.id;
      row.querySelector('.seq').textContent = String(globalSeq).padStart(3, '0');
      buildFavicon(row.querySelector('.favicon'), tab);
      const titleEl = row.querySelector('.title');
      const isSelf = selfTabId !== null && tab.id === selfTabId;
      titleEl.textContent = title + (isSelf ? '　（本页面）' : '');
      titleEl.title = title;
      row.querySelector('.host').textContent = host;
      if (tab.active) row.querySelector('.active-dot').hidden = false;
      if (isSelf) {
        row.classList.add('self');
      } else {
        row.tabIndex = 0;
        row.addEventListener('click', () => switchToTab(win, tab));
        row.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchToTab(win, tab); }
        });
      }
      matchingRows.push(row);
    });

    if (!matchingRows.length) return;

    const section = winTemplate.content.firstElementChild.cloneNode(true);
    section.querySelector('.callsign').textContent = `WIN-${String(winIdx + 1).padStart(2, '0')}`;
    const metaEl = section.querySelector('.win-meta');
    metaEl.textContent = `${tabs.length} 个标签`;
    if (win.focused) {
      const flag = document.createElement('span');
      flag.className = 'current-flag'; flag.textContent = '· 当前窗口';
      metaEl.appendChild(flag);
    }
    const list = section.querySelector('.tab-list');
    matchingRows.forEach(r => list.appendChild(r));
    contentEl.appendChild(section);
  });

  totalsEl.textContent = `${windows.length} 窗口 · ${totalTabs} 标签`;
  emptyStateEl.hidden = visibleTabs > 0;
}

async function switchToTab(win, tab) {
  try {
    const props = { focused: true };
    if (win.state === 'minimized') props.state = 'normal';
    await chrome.windows.update(win.id, props);
    await chrome.tabs.update(tab.id, { active: true });
  } catch (err) { console.error('切换标签失败', err); }
}

let lastWindows = [];
async function refresh() {
  lastWindows = await fetchWindowsSorted();
  render(lastWindows, filterText);
}
const debouncedRefresh = debounce(refresh, 150);

filterInput.addEventListener('input', () => {
  filterText = filterInput.value;
  render(lastWindows, filterText);
});
refreshBtn.addEventListener('click', refresh);

const liveEvents = [
  chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated,
  chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached,
  chrome.tabs.onActivated, chrome.tabs.onReplaced,
  chrome.windows.onCreated, chrome.windows.onRemoved, chrome.windows.onFocusChanged
];
const listenerRefs = liveEvents.map(evt => {
  const handler = () => debouncedRefresh();
  evt.addListener(handler);
  return { evt, handler };
});
window.addEventListener('pagehide', () =>
  listenerRefs.forEach(({ evt, handler }) => evt.removeListener(handler)));

// ══════════════════════════════════════════════════════
// 书签组
// ══════════════════════════════════════════════════════

// storage 的数据结构：
// {
//   workspaceFolderId: "123",   // 工作区文件夹的 bookmark id
//   onetimeFolderIds: ["124"]   // 被用户标记为"取出后删除"的子文件夹 id 集合
// }

let workspaceFolderId = null;
let onetimeFolderIds  = new Set();

async function loadSettings() {
  const data = await store.get(['workspaceFolderId', 'onetimeFolderIds']);
  workspaceFolderId = data.workspaceFolderId || null;
  onetimeFolderIds  = new Set(data.onetimeFolderIds || []);
}

async function saveSettings() {
  await store.set({
    workspaceFolderId,
    onetimeFolderIds: [...onetimeFolderIds],
  });
}

// 递归遍历书签树，找 id 匹配的节点
function findNodeById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

// 把书签树拍平成"只含文件夹"的列表，填 <select>
function flattenFolders(root) {
  const out = [];
  function walk(node, depth) {
    if (!node.children) return; // 是书签，不是文件夹
    if (node.id !== '0') out.push({ id: node.id, depth, label: node.title || '(未命名)' });
    (node.children || []).forEach(c => walk(c, node.id === '0' ? 0 : depth + 1));
  }
  walk(root, 0);
  return out;
}

// 填写工作区 <select> 内容
async function populateWorkspaceSelect() {
  const [tree] = await chrome.bookmarks.getTree();
  const folders = flattenFolders(tree);
  workspaceSelect.innerHTML = '';
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = '\u3000'.repeat(f.depth) + f.label;
    workspaceSelect.appendChild(opt);
  }
  if (workspaceFolderId) workspaceSelect.value = workspaceFolderId;
}

// 渲染书签组列表
async function renderGroups() {
  groupList.innerHTML = '';

  if (!workspaceFolderId) {
    groupEmpty.hidden = false;
    return;
  }
  groupEmpty.hidden = true;

  let subTree;
  try {
    [subTree] = await chrome.bookmarks.getSubTree(workspaceFolderId);
  } catch {
    // 工作区文件夹被删除了
    workspaceFolderId = null;
    await saveSettings();
    groupEmpty.hidden = false;
    return;
  }

  const subFolders = (subTree.children || []).filter(n => n.url === undefined);

  if (!subFolders.length) {
    const hint = document.createElement('p');
    hint.className = 'group-empty-hint';
    hint.textContent = '工作区文件夹内暂无子文件夹';
    groupList.appendChild(hint);
    return;
  }

  subFolders.forEach(folder => {
    const bookmarks = (folder.children || []).filter(n => n.url !== undefined);
    const isOnetime  = onetimeFolderIds.has(folder.id);
    const card = buildGroupCard(folder, bookmarks, isOnetime);
    groupList.appendChild(card);
  });
}

// 构建单个书签组卡片
function buildGroupCard(folder, bookmarks, isOnetime) {
  const card = groupTemplate.content.firstElementChild.cloneNode(true);

  card.querySelector('.group-name').textContent = folder.title || '(未命名文件夹)';

  // ── 模式切换按钮 ──
  // 两个状态：
  //   固定（默认）：📌  点击可切换为"取出后删除"
  //   取出后删除：🗑  点击可切换回"固定"
  const modeBtn = card.querySelector('.mode-toggle');
  function updateModeBtn(onetime) {
    if (onetime) {
      modeBtn.textContent = '🗑 取出后删除';
      modeBtn.classList.add('onetime');
      modeBtn.title = '当前：打开后将删除这个文件夹的所有书签\n点击切换为固定模式';
    } else {
      modeBtn.textContent = '📌 固定';
      modeBtn.classList.remove('onetime');
      modeBtn.title = '当前：打开后书签保留\n点击切换为"取出后删除"模式';
    }
  }
  updateModeBtn(isOnetime);

  modeBtn.addEventListener('click', async () => {
    const nowOnetime = onetimeFolderIds.has(folder.id);
    if (nowOnetime) {
      onetimeFolderIds.delete(folder.id);
    } else {
      onetimeFolderIds.add(folder.id);
    }
    await saveSettings();
    updateModeBtn(!nowOnetime);
  });

  // ── 打开按钮 ──
  const openBtn = card.querySelector('.open-btn');
  if (!bookmarks.length) {
    openBtn.disabled = true;
    openBtn.title = '文件夹内没有书签';
  }

  openBtn.addEventListener('click', async () => {
    if (!bookmarks.length) return;
    const urls = bookmarks.map(b => b.url);

    // 批量在新窗口打开
    // chrome.windows.create 接受 url 数组，会在新窗口创建对应数量的标签页
    await chrome.windows.create({ url: urls });

    // 如果是"取出后删除"模式，删除整个子文件夹
    if (onetimeFolderIds.has(folder.id)) {
      try {
        await chrome.bookmarks.removeTree(folder.id);
        // 从 Set 里也清掉这个 id，这个文件夹已经不存在了
        onetimeFolderIds.delete(folder.id);
        await saveSettings();
        // 重新渲染书签组列表
        await renderGroups();
      } catch (err) {
        console.error('删除书签文件夹失败', err);
      }
    }
  });

  // ── 书签预览列表 ──
  const urlList = card.querySelector('.group-urls');
  if (!bookmarks.length) {
    const hint = document.createElement('li');
    hint.className = 'group-empty-hint';
    hint.textContent = '此文件夹内没有书签';
    urlList.appendChild(hint);
  } else {
    bookmarks.forEach(bm => {
      const li = document.createElement('li');
      li.className = 'group-url-item';

      const img = document.createElement('img');
      img.alt = ''; img.src = faviconURL(bm.url, 16);
      img.onerror = () => img.replaceWith(makeBarFallback(bm.title || bm.url || '?'));

      const titleSpan = document.createElement('span');
      titleSpan.className = 'url-title';
      titleSpan.textContent = bm.title || bm.url;
      titleSpan.title = bm.url;

      li.appendChild(img);
      li.appendChild(titleSpan);
      urlList.appendChild(li);
    });
  }

  return card;
}

// ── 配置面板的交互 ──

configBtn.addEventListener('click', async () => {
  const willOpen = configArea.hidden;
  configArea.hidden = !willOpen;
  if (!configArea.hidden) {
    await populateWorkspaceSelect();
  }
});

saveConfigBtn.addEventListener('click', async () => {
  workspaceFolderId = workspaceSelect.value || null;
  await saveSettings();
  configArea.hidden = true;
  await renderGroups();
});

cancelConfigBtn.addEventListener('click', () => {
  configArea.hidden = true;
});

goConfigBtn.addEventListener('click', async () => {
  configArea.hidden = false;
  await populateWorkspaceSelect();
  configBtn.scrollIntoView({ behavior: 'smooth' });
});

// ══════════════════════════════════════════════════════
// 初始化
// ══════════════════════════════════════════════════════

(async function init() {
  selfTabId = await getSelfTabId();

  // 三件事并行启动，互不依赖
  await Promise.all([
    refresh(),
    loadBookmarksBar(),
    (async () => {
      await loadSettings();
      await renderGroups();
    })(),
  ]);

  filterInput.focus();
})();
