// 新标签页脚本

const STORAGE_KEY = 'tabBookmarkSaver';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await init();

  // 绑定设置按钮事件
  document.getElementById('openSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 绑定过滤输入框事件
  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      loadWindows(e.target.value);
    });
    filterInput.addEventListener('focus', () => {
      loadWindows(filterInput.value);
    });
  }

  // 监听刷新消息
  // chrome.runtime.onMessage.addListener((request) => {
  //   if (request.action === 'refreshTabs') {
  //     loadData();
  //   }
  // });
});

let gSettings = {};

async function init() {
  // 检查设置
  const config = await chrome.storage.sync.get([STORAGE_KEY]);
  gSettings = config[STORAGE_KEY] || {};

  if (gSettings.hideBookmarkBar === true) {
    document.getElementById('bookmarkBar').classList.add('hidden');
  } else {
    await loadBookmarkBar();
  }

  // 应用标题换行设置
  if (gSettings.wrapTitleText === true) {
    document.body.classList.add('wrap-titles');
  }

  await loadData();
}

// 加载书签栏
async function loadBookmarkBar() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getBookmarkBar' });
    if (response.success) {
      renderBookmarkBar(response.bookmarks);
    }
  } catch (error) {
    console.error('加载书签栏失败:', error);
  }
}

// 渲染书签栏
function renderBookmarkBar(bookmarks) {
  const container = document.getElementById('bookmarkBarContent');
  container.innerHTML = '';

  if (!bookmarks || bookmarks.length === 0) {
    container.innerHTML = '<span style="color: #9aa0a6; font-size: 12px;">书签栏为空</span>';
    return;
  }

  bookmarks.forEach(bookmark => {
    container.appendChild(createBookmarkBarItem(bookmark));
  });
}

function createBookmarkBarItem(bookmark) {
  if (bookmark.children) {
    // 文件夹
    const folder = document.createElement('div');
    folder.className = 'bookmark-folder';

    // 收集所有书签URL（不包括子文件夹）
    const bookmarkUrls = [];
    bookmark.children.forEach(child => {
      if (!child.children && child.url) {
        bookmarkUrls.push(child.url);
      }
    });

    // 设置title提示
    const itemCount = bookmarkUrls.length;
    let titleText = `书签为空`;
    if (itemCount > 0) titleText = `点击打开${itemCount}个书签`;
    folder.title = titleText;

    const trigger = document.createElement('div');
    trigger.className = 'bookmark-item';
    trigger.innerHTML = `
      <span class="favicon">📁</span>
      <span class="title">${escapeHtml(bookmark.title)}</span>
    `;

    // 点击打开所有书签
    trigger.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (bookmarkUrls.length > 0) {
        chrome.windows.create({ url: bookmarkUrls });
      }
    });

    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';

    if (bookmark.children && bookmark.children.length > 0) {
      bookmark.children.forEach(child => {
        dropdown.appendChild(createBookmarkBarItem(child));
      });
    } else {
      // 空文件夹提示
      const emptyItem = document.createElement('div');
      emptyItem.className = 'bookmark-item empty-folder-item';
      emptyItem.style.cursor = 'default';
      emptyItem.style.color = 'var(--muted)';
      emptyItem.style.fontStyle = 'italic';
      emptyItem.innerHTML = `<span class="title">(空文件夹)</span>`;
      dropdown.appendChild(emptyItem);
    }

    folder.appendChild(trigger);
    folder.appendChild(dropdown);
    return folder;
  } else {
    // 书签
    const link = document.createElement('a'); 
    link.className = 'bookmark-item';
    link.href = bookmark.url;
    link.title = bookmark.title;
    const titleEle = document.createElement('span');
    titleEle.className = 'title';
    titleEle.textContent = bookmark.title;
    const favicon = getFaviconEle('favicon', bookmark.url, bookmark.title);
    link.appendChild(favicon);
    link.appendChild(titleEle);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentTabUpdate(bookmark.url);
    });
    return link;
  }
}

// 加载数据
async function loadData() {
  await loadWindows();
  await loadBookmarks();
}

// 加载打开的标签页
async function loadWindows(filterText='') {
  const lf = filterText.trim().toLowerCase();
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getAllWindows',
      filterText: lf
    });
    if (response.success) {
      renderWindows(response.windows);
    }
  } catch (error) {
    console.error('加载窗口失败:', error);
  }
}

// 渲染窗口
function renderWindows(windows) {
  const container = document.getElementById('windowsContainer');
  const badge = document.getElementById('windowsBadge');

  container.innerHTML = '';
  badge.textContent = windows.length;

  if (windows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗔</div>
        <div class="empty-state-text">没有打开的标签页</div>
      </div>
    `;
    return;
  }

  windows.forEach((window, windowIndex) => {
    const card = document.createElement('div');
    card.className = 'window-card';

    const isCurrentWindow = window.focused;

    card.innerHTML = `
      <div class="window-header">
        <div class="window-title">
          <div class="window-controls">
            <span class="window-control-btn close"></span>
            <span class="window-control-btn minimize"></span>
            <span class="window-control-btn maximize"></span>
          </div>
          ${isCurrentWindow ? '<span class="window-badge">当前窗口</span>' : ''}
        </div>
        <span class="tab-count">${window.tabs.length} 个标签</span>
      </div>
      <div class="tab-list">
        ${window.tabs.map((tab) => {
          const domain = extractDomain(tab.url);
          return `
            <div class="tab-item ${tab.active ? 'active' : ''}" data-window-id="${window.id}" data-tab-id="${tab.id}">
              ${getFaviconEle('tab-favicon', tab.url, tab.title).outerHTML}
              <span class="tab-title">${escapeHtml(tab.title)}</span>
              <span class="tab-domain">${domain}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 绑定点击事件
    card.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', async () => {
        const windowId = parseInt(item.dataset.windowId);
        const tabId = parseInt(item.dataset.tabId);

        try {
          await chrome.runtime.sendMessage({
            action: 'activateTab',
            windowId,
            tabId
          });
        } catch (error) {
          console.error('激活标签页失败:', error);
        }
      });
    });

    container.appendChild(card);
  });
}

// 加载工作区书签
async function loadBookmarks() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getWorkspaceBookmarks' });
    if (response.success) {
      renderBookmarks(response.bookmarks);
    }
  } catch (error) {
    console.error('加载书签失败:', error);
  }
}

// 渲染书签
function renderBookmarks(folders) {
  const container = document.getElementById('bookmarksContainer');
  const badge = document.getElementById('bookmarksBadge');

  container.innerHTML = '';
  badge.textContent = folders.length;

  if (folders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-text">工作区为空</div>
        <div class="empty-state-text" style="font-size: 12px; margin-top: 4px;">右键点击页面或使用扩展按钮保存标签页</div>
      </div>
    `;
    return;
  }

  folders.forEach((folder) => {
    const card = document.createElement('div');
    card.className = 'bookmark-folder-card';

    const date = new Date(folder.dateAdded);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    card.innerHTML = `
      <div class="folder-header" data-folder-id="${folder.id}">
        <div class="folder-title">
          <span>${escapeHtml(folder.title)}</span>
        </div>
        <span class="open-all-hint">↗ 打开全部</span>
        <span class="tab-count">${folder.bookmarks.length} 个标签 · ${dateStr}</span>
      </div>
      <div class="bookmark-list">
        ${folder.bookmarks.map((bm) => {
          const domain = extractDomain(bm.url);
          return `
            <div class="bookmark-item-card" data-url="${escapeHtml(bm.url)}">
              ${getFaviconEle('bookmark-favicon', bm.url, bm.title).outerHTML}
              <span class="bookmark-title">${escapeHtml(bm.title)}</span>
              <span class="bookmark-domain">${domain}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 绑定整个 card 点击事件来打开文件夹
    card.addEventListener('click', async (e) => {
      // 如果点击的是单个书签，不触发打开全部
      if (e.target.closest('.bookmark-item-card')) {
        return;
      }
      const folderId = card.querySelector('.folder-header').dataset.folderId;
      try {
        await chrome.runtime.sendMessage({
          action: 'openBookmarkFolder',
          folderId: folderId,
          asTabGroup: gSettings.openAsTabGroup === true
        });
        // 刷新显示
        await loadBookmarks();
      } catch (error) {
        console.error('打开书签文件夹失败:', error);
        alert('打开失败: ' + error.message);
      }
    });

    // 绑定单个书签点击事件
    card.querySelectorAll('.bookmark-item-card').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        currentTabUpdate(item.dataset.url);
      });
    });

    container.appendChild(card);
  });
}

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getfaviconURL(url, size = 32) {  
  const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
  faviconUrl.searchParams.set('pageUrl', url);
  faviconUrl.searchParams.set('size', String(size));
  return faviconUrl.toString();
}

function makeFallbackIcon(title) {
  const text = title.trim();
  const span = document.createElement('span');
  span.className = 'fallback';
  span.style.cssText = 'width:13px;height:13px;border-radius:3px;background:var(--border);font-size:8px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);color:var(--muted);flex-shrink:0';
  span.textContent = (text[0] || '?').toUpperCase();
  return span;
}

function getFaviconEle(classname, url, title) {
  // 对特殊页面使用回退方案
  // if (url.startsWith('chrome://') || 
  //     url.startsWith('chrome-extension://') ||
  //     url.startsWith('file://')) {
  //   return makeFallbackIcon(url);
  // }
  const img = document.createElement('img');
  img.className = classname;img.alt = ''; img.src = getfaviconURL(url);
  img.onerror = () => img.replaceWith(makeFallbackIcon(title || url || '?'));
  return img;
}

async function currentTabUpdate(url){
  if (url.startsWith('data:')) {// data URL 只能在新标签页中打开
    chrome.tabs.create({ url: url });
    return;
  }
  const tab = await chrome.tabs.getCurrent();
  chrome.tabs.update(tab.id, { url:url });
  return;
}

// 刷新窗口和标签页的显示
function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
async function refresh() {
  // loadWindows();
  const filterInput = document.getElementById('filterInput');
  loadWindows(filterInput?.value || '');
}
const debouncedRefresh = debounce(refresh, 150);
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