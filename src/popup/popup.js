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
        <button id="openOptions" class="snapshot-btn">打开设置</button>
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

  try {
    const currentWindow = await chrome.windows.getCurrent();
    const response = await chrome.runtime.sendMessage({
      action: 'getWindowTabGroupsPreview',
      windowId: currentWindow.id
    });

    if (response.success) {
      renderTabList(tabList, response.tabs);
      updateFolderNameRow(response.ungrouped.count);

      if (response.total === 0) {
        saveBtn.disabled = true;
      }
    } else {
      tabList.innerHTML = '<div class="empty-state">获取快照预览失败</div>';
      saveBtn.disabled = true;
    }
  } catch (error) {
    console.error('获取快照预览失败:', error);
    tabList.innerHTML = '<div class="empty-state">获取快照预览失败</div>';
    saveBtn.disabled = true;
  }
}

// 按窗口标签页顺序渲染标签列表，并在每个分组段前显示组名
function renderTabList(container, tabs) {
  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = '<div class="empty-state">没有可保存的标签页</div>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'tab-list-items';

  let lastGroupId = null;
  for (const tab of tabs) {
    if (tab.groupId !== -1 && tab.groupId !== lastGroupId) {
      list.appendChild(createGroupHeader(tab.groupTitle, tab.groupColor));
    }
    list.appendChild(createTabItem(tab));
    lastGroupId = tab.groupId;
  }

  container.appendChild(list);
}

// 创建分组标题行
function createGroupHeader(title, colorName) {
  const header = document.createElement('li');
  header.className = 'group-header';

  const hex = colorName ? getGroupColorHex(colorName) : null;
  if (hex) {
    header.style.setProperty('--group-bg', hex + '12');
    header.style.setProperty('--group-color', hex);
  }

  const dot = document.createElement('span');
  dot.className = 'group-color-dot';

  const name = document.createElement('span');
  name.className = 'group-name';
  name.textContent = title || '未命名分组';

  header.appendChild(dot);
  header.appendChild(name);

  return header;
}

// 创建单个标签项
function createTabItem(tab) {
  const item = document.createElement('li');
  item.className = 'tab-item';

  const indicator = document.createElement('div');
  indicator.className = 'tab-group-indicator';
  indicator.style.backgroundColor = tab.groupColor ? getGroupColorHex(tab.groupColor) : 'transparent';

  const favicon = document.createElement('img');
  favicon.className = 'tab-favicon';
  favicon.src = getFaviconUrl(tab.url);
  favicon.alt = '';
  favicon.onerror = () => {
    favicon.src = transparentPixel;
  };

  const info = document.createElement('div');
  info.className = 'tab-info';

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || '无标题';
  title.title = tab.title || '无标题';
  if (tab.groupColor) {
    title.style.color = getGroupColorHex(tab.groupColor);
  }

  const url = document.createElement('div');
  url.className = 'tab-url';
  url.textContent = tab.url;
  url.title = tab.url;

  info.appendChild(title);
  info.appendChild(url);
  item.appendChild(indicator);
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
      saveBtn.innerHTML = '<span class="icon">📸</span> 快照：保存并关闭窗口';
    }
  } catch (error) {
    showStatus('保存失败: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="icon">📸</span> 快照：保存并关闭窗口';
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