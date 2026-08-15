// Popup 页面脚本

import { STORAGE_KEY } from '/constants.js';

// 1x1 透明像素，用于 favicon 加载失败时的占位
const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

document.addEventListener('DOMContentLoaded', async () => {
  const hasWorkspace = await hasWorkspaceFolder();
  if (!hasWorkspace) {
    renderSetupRequired();
    return;
  }

  await loadPreview();
  bindSaveButton();
  initFootNote();
});

// 检查是否已配置工作区文件夹
async function hasWorkspaceFolder() {
  try {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = result[STORAGE_KEY] || {};
    return !!settings.workspaceFolderId;
  } catch (error) {
    console.error('检查工作区失败:', error);
    return false;
  }
}

// 显示需要设置工作区的提示
function renderSetupRequired() {
  document.body.innerHTML = `
    <div class="popup">
      <div class="setup-required">
        <h2>未设置工作区</h2>
        <p>使用扩展前，请先在设置页面中选择或创建一个工作区文件夹。</p>
        <button id="openOptions" class="btn-primary">打开设置</button>
      </div>
    </div>
    <div id="status" class="status"></div>
  `;

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// 加载并渲染当前窗口的快照预览
async function loadPreview() {
  const tabList = document.getElementById('tabList');
  const saveBtn = document.getElementById('saveBtn');
  const totalCount = document.getElementById('totalCount');

  try {
    const currentWindow = await chrome.windows.getCurrent();
    const response = await chrome.runtime.sendMessage({
      action: 'getWindowTabGroupsPreview',
      windowId: currentWindow.id
    });

    if (response.success) {
      renderTabList(tabList, response.tabs, response.groups || []);
      updateFolderNameRow(response.ungrouped.count);

      const groupCount = response.groups ? response.groups.length : 0;
      totalCount.textContent = `${response.total} TABS · ${groupCount} GROUPS`;

      if (response.total === 0) {
        saveBtn.disabled = true;
      }
    } else {
      tabList.innerHTML = '<div class="empty-state">获取快照预览失败</div>';
      saveBtn.disabled = true;
      totalCount.textContent = '0 TABS · 0 GROUPS';
    }
  } catch (error) {
    console.error('获取快照预览失败:', error);
    tabList.innerHTML = '<div class="empty-state">获取快照预览失败</div>';
    saveBtn.disabled = true;
    totalCount.textContent = '0 TABS · 0 GROUPS';
  }
}

// 按窗口标签页顺序渲染分组列表
function renderTabList(container, tabs, groups) {
  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = '<div class="empty-state">没有可保存的标签页</div>';
    return;
  }

  // 统计每个分组的标签数量
  const groupCounts = new Map();
  for (const tab of tabs) {
    groupCounts.set(tab.groupId, (groupCounts.get(tab.groupId) || 0) + 1);
  }

  const groupMap = new Map();
  for (const group of groups) {
    groupMap.set(group.groupId, group);
  }

  let lastGroupId = null;
  let currentInner = null;

  for (const tab of tabs) {
    if (tab.groupId !== lastGroupId) {
      if (tab.groupId === -1) {
        // 未分组的标签直接列出，不显示分组标题
        currentInner = null;
      } else {
        const group = groupMap.get(tab.groupId);
        const title = group?.title || '未命名分组';
        const color = group?.color;
        const collapsed = group?.collapsed ?? false;
        const count = groupCounts.get(tab.groupId) || 0;

        const groupEl = createGroup(tab.groupId, title, color, count, collapsed);
        container.appendChild(groupEl);
        currentInner = groupEl.querySelector('.group-body-inner');
      }
      lastGroupId = tab.groupId;
    }

    const item = createTabItem(tab);
    if (currentInner) {
      currentInner.appendChild(item);
    } else {
      container.appendChild(item);
    }
  }
}

// 折叠箭头 SVG
function chevronSVG() {
  return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg>`;
}

// 创建分组容器
function createGroup(groupId, title, colorName, count, collapsed) {
  const wrap = document.createElement('div');
  wrap.className = 'group';
  if (collapsed) {
    wrap.classList.add('collapsed');
  }

  const hex = colorName ? getGroupColorHex(colorName) : null;
  if (hex) {
    wrap.style.setProperty('--group-color', hex);
    wrap.style.setProperty('--group-color-faded', hexToRgba(hex, 0.25));
  }

  const head = document.createElement('div');
  head.className = 'group-head';
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', String(!collapsed));

  const dot = document.createElement('span');
  dot.className = 'group-dot';
  if (hex) {
    dot.style.backgroundColor = hex;
  }

  const name = document.createElement('span');
  name.className = 'group-name';
  name.textContent = title;

  const countEl = document.createElement('span');
  countEl.className = 'group-count';
  countEl.textContent = count;

  const chevron = document.createElement('span');
  chevron.className = 'group-chevron';
  chevron.innerHTML = chevronSVG();

  head.appendChild(dot);
  head.appendChild(name);
  head.appendChild(countEl);
  head.appendChild(chevron);

  const toggle = async () => {
    const willCollapse = !wrap.classList.contains('collapsed');

    try {
      await chrome.tabGroups.update(groupId, { collapsed: willCollapse });
    } catch (error) {
      console.error('同步标签组折叠状态失败:', error);
    }

    const isCollapsed = wrap.classList.toggle('collapsed');
    head.setAttribute('aria-expanded', String(!isCollapsed));
  };

  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  const body = document.createElement('div');
  body.className = 'group-body';

  const inner = document.createElement('div');
  inner.className = 'group-body-inner';
  body.appendChild(inner);

  wrap.appendChild(head);
  wrap.appendChild(body);

  return wrap;
}

// 将十六进制颜色转换为 rgba
function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 创建单个标签项
function createTabItem(tab) {
  const item = document.createElement('div');
  item.className = 'tab';

  const favicon = document.createElement('img');
  favicon.className = 'favicon';
  favicon.src = getFaviconUrl(tab.url);
  favicon.alt = '';
  favicon.onerror = () => {
    favicon.src = transparentPixel;
  };

  const info = document.createElement('div');
  info.className = 'tab-text';

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || '无标题';
  title.title = tab.title || '无标题';

  const titleColor = tab.groupColor ? getGroupColorHex(tab.groupColor) : null;
  if (titleColor && titleColor !== 'transparent') {
    title.style.color = titleColor;
  }

  const url = document.createElement('div');
  url.className = 'tab-url';
  url.textContent = tab.url;
  url.title = tab.url;

  info.appendChild(title);
  info.appendChild(url);
  item.appendChild(favicon);
  item.appendChild(info);

  return item;
}

// 获取标签组颜色的十六进制值
function getGroupColorHex(colorName) {
  const map = {
    grey: '#5f6368',
    blue: '#1a73e8',
    red: '#d93025',
    yellow: '#f9ab00',
    green: '#137333',
    pink: '#ff63ed',
    purple: '#9334e6',
    cyan: '#12b5cb',
    orange: '#fa7b17'
  };
  return map[colorName] || 'transparent';
}

// 使用 Chrome _favicon API 获取 favicon 地址
function getFaviconUrl(pageUrl, size = 32) {
  if (!pageUrl) {
    return transparentPixel;
  }
  const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
  faviconUrl.searchParams.set('pageUrl', pageUrl);
  faviconUrl.searchParams.set('size', String(size));
  return faviconUrl.toString();
}

// 根据是否存在未分组标签页控制文件夹名称输入框
function updateFolderNameRow(ungroupedCount) {
  const row = document.getElementById('folderNameRow');
  if (ungroupedCount > 0) {
    row.style.display = '';
  } else {
    row.style.display = 'none';
    document.getElementById('folderName').value = '';
  }
}

// 绑定保存按钮事件
function bindSaveButton() {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.addEventListener('click', saveTabs);

  document.getElementById('folderName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveTabs();
    }
  });
}

// 初始化 foot-note 关闭状态
async function initFootNote() {
  const footNote = document.getElementById('footNote');
  const closeBtn = document.getElementById('footNoteClose');
  if (!footNote || !closeBtn) return;

  try {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = result[STORAGE_KEY] || {};
    if (settings.popupFootNoteDismissed) {
      footNote.classList.add('hidden');
      return;
    }
  } catch (error) {
    console.error('读取 foot-note 状态失败:', error);
  }

  closeBtn.addEventListener('click', async () => {
    footNote.classList.add('hidden');
    try {
      const result = await chrome.storage.sync.get([STORAGE_KEY]);
      const settings = result[STORAGE_KEY] || {};
      await chrome.storage.sync.set({
        [STORAGE_KEY]: { ...settings, popupFootNoteDismissed: true }
      });
    } catch (error) {
      console.error('保存 foot-note 状态失败:', error);
    }
  });
}

// 保存标签页
async function saveTabs() {
  const folderName = document.getElementById('folderName').value.trim() || null;
  const currentWindow = await chrome.windows.getCurrent();
  const saveBtn = document.getElementById('saveBtn');

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="icon">⏳</span> 保存中...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveTabs',
      folderName: folderName,
      windowId: currentWindow.id
    });

    if (response.success) {
      showStatus('保存成功！', 'success');
    } else {
      showStatus('保存失败: ' + response.error, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="icon">📸</span> 保存并关闭窗口';
    }
  } catch (error) {
    showStatus('保存失败: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="icon">📸</span> 保存并关闭窗口';
  }
}

// 显示状态消息
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + type + ' show';

  setTimeout(() => {
    status.classList.remove('show');
  }, 3000);
}