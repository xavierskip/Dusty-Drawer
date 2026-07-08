// 设置页面脚本

import { STORAGE_KEY } from '/constants.js';

document.addEventListener('DOMContentLoaded', async () => {
  showExtensionVersion();
  await loadSettings();
  bindEvents();
});

// 显示扩展版本号
function showExtensionVersion() {
  const versionEl = document.getElementById('extensionVersion');
  if (versionEl) {
    const c = chrome.runtime.getManifest();
    versionEl.textContent = `${c.name} v${c.version}`;
  }
}

// 加载设置
async function loadSettings() {
  const config = await chrome.storage.sync.get([STORAGE_KEY]);
  const settings = config[STORAGE_KEY] || {};

  // 加载工作区显示
  const workspaceNameEl = document.querySelector('.workspace-name');
  let hasWorkspace = false;

  if (settings.workspaceFolderId) {
    try {
      const folder = await chrome.bookmarks.get(settings.workspaceFolderId);
      if (folder && folder.length > 0) {
        workspaceNameEl.textContent = folder[0].title;
        hasWorkspace = true;
      }
    } catch (e) {
      workspaceNameEl.textContent = '未找到（已删除）';
    }
  }

  workspaceNameEl.classList.toggle('unset', !hasWorkspace);
  updateSetupBanner(hasWorkspace);

  // 加载开关状态
  document.getElementById('hideBookmarkBar').checked = settings.hideBookmarkBar === true;
  document.getElementById('wrapTitleText').checked = settings.wrapTitleText === true;
  document.getElementById('openAsTabGroup').checked = settings.openAsTabGroup === true;
  document.getElementById('disableOpenAnimation').checked = settings.disableOpenAnimation === true;
}

// 更新顶部设置提示横幅
// hasWorkspace: true 表示已设置工作区，隐藏横幅；false 表示未设置，显示横幅
function updateSetupBanner(hasWorkspace) {
  const banner = document.getElementById('setupBanner');
  if (hasWorkspace) {
    banner.classList.add('hidden');
  } else {
    banner.classList.remove('hidden');
  }
}

// 绑定事件
function bindEvents() {
  // 返回新标签页
  document.getElementById('backToNewTab').addEventListener('click', () => {
    chrome.tabs.update({ url: 'chrome://newtab/' });
  });

  // 选择工作区文件夹
  document.getElementById('selectWorkspace').addEventListener('click', showFolderSelector);

  // 创建工作区
  document.getElementById('createWorkspace').addEventListener('click', createWorkspace);

  // 关闭顶栏书签栏开关
  document.getElementById('hideBookmarkBar').addEventListener('change', async (e) => {
    const config = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = config[STORAGE_KEY] || {};
    settings.hideBookmarkBar = e.target.checked;
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    showToast(e.target.checked ? '已关闭顶栏书签栏' : '已显示顶栏书签栏', 'success');
  });

  // 标题自动换行开关
  document.getElementById('wrapTitleText').addEventListener('change', async (e) => {
    const config = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = config[STORAGE_KEY] || {};
    settings.wrapTitleText = e.target.checked;
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    showToast(e.target.checked ? '已开启标题自动换行' : '已关闭标题自动换行', 'success');
  });

  // 以标签组形式打开开关
  document.getElementById('openAsTabGroup').addEventListener('change', async (e) => {
    const config = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = config[STORAGE_KEY] || {};
    settings.openAsTabGroup = e.target.checked;
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    showToast(e.target.checked ? '已开启以标签组形式打开' : '已关闭以标签组形式打开', 'success');
  });

  // 关闭打开单个链接时的页面动画效果开关
  document.getElementById('disableOpenAnimation').addEventListener('change', async (e) => {
    const config = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = config[STORAGE_KEY] || {};
    settings.disableOpenAnimation = e.target.checked;
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    showToast(e.target.checked ? '已关闭页面动画效果' : '已开启页面动画效果', 'success');
  });

  // 清空工作区
  document.getElementById('clearWorkspace').addEventListener('click', clearWorkspace);
}

// 显示文件夹选择器
async function showFolderSelector() {
  // 获取所有书签
  const tree = await chrome.bookmarks.getTree();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>选择工作区文件夹</h3>
      </div>
      <div class="modal-body">
        <div class="folder-tree" id="folderTree">
          <!-- 动态填充 -->
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelSelect">取消</button>
        <button class="btn btn-primary" id="confirmSelect" disabled>选择</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 渲染文件夹树
  const treeContainer = document.getElementById('folderTree');
  let selectedId = null;

  function renderFolderTree(nodes, container, level = 0) {
    nodes.forEach(node => {
      if (node.url) return; // 跳过书签，只显示文件夹

      const item = document.createElement('div');
      item.className = 'folder-tree-item';
      item.style.paddingLeft = `${12 + level * 16}px`;
      item.innerHTML = `
        <span class="icon">📁</span>
        <span>${escapeHtml(node.title || '书签栏')}</span>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.folder-tree-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedId = node.id;
        document.getElementById('confirmSelect').disabled = false;
      });

      container.appendChild(item);

      // 递归渲染子文件夹
      if (node.children && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        const folderChildren = node.children.filter(c => !c.url);
        if (folderChildren.length > 0) {
          renderFolderTree(folderChildren, container, level + 1);
        }
      }
    });
  }

  renderFolderTree(tree[0].children, treeContainer);

  // 取消
  document.getElementById('cancelSelect').addEventListener('click', () => {
    overlay.remove();
  });

  // 确认选择
  document.getElementById('confirmSelect').addEventListener('click', async () => {
    if (selectedId) {
      try {
        const folder = await chrome.bookmarks.get(selectedId);
        if (folder && folder.length > 0) {
          const config = await chrome.storage.sync.get([STORAGE_KEY]);
          const settings = config[STORAGE_KEY] || {};
          settings.workspaceFolderId = selectedId;
          await chrome.storage.sync.set({ [STORAGE_KEY]: settings });

          const workspaceNameEl = document.querySelector('.workspace-name');
          workspaceNameEl.textContent = folder[0].title;
          workspaceNameEl.classList.remove('unset');
          showToast('工作区已更新', 'success');
          overlay.remove();
          updateSetupBanner(true);
        }
      } catch (error) {
        showToast('选择失败: ' + error.message, 'error');
      }
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// 创建工作区
async function createWorkspace() {
  const nameInput = document.getElementById('newWorkspaceName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('请输入工作区名称', 'error');
    return;
  }

  try {
    // 创建新书签文件夹
    const newFolder = await chrome.bookmarks.create({ title: name });

    // 更新设置
    const config = await chrome.storage.sync.get([STORAGE_KEY]);
    const settings = config[STORAGE_KEY] || {};
    settings.workspaceFolderId = newFolder.id;
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });

    // 更新显示
    const workspaceNameEl = document.querySelector('.workspace-name');
    workspaceNameEl.textContent = name;
    workspaceNameEl.classList.remove('unset');
    nameInput.value = '';
    updateSetupBanner(true);

    showToast('工作区创建成功', 'success');
  } catch (error) {
    showToast('创建工作区失败: ' + error.message, 'error');
  }
}

// 清空工作区
async function clearWorkspace() {
  const config = await chrome.storage.sync.get([STORAGE_KEY]);
  const settings = config[STORAGE_KEY] || {};

  if (!settings.workspaceFolderId) {
    showToast('未设置工作区', 'error');
    return;
  }

  // 扩展不会执行真正的删除操作，而是引导用户自行在书签管理器中处理
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>🙅 这里不会真的清空</h3>
      </div>
      <div class="modal-body">
        <p>扩展不会删除工作区中的内容。</p>
        <p>请打开 Chrome 书签管理器，找到工作区文件夹后手动删除。</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelClear">知道了</button>
        <button class="btn btn-primary" id="openBookmarks">打开书签管理器</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('cancelClear').addEventListener('click', () => {
    overlay.remove();
  });

  document.getElementById('openBookmarks').addEventListener('click', () => {
    const url = new URL('chrome://bookmarks/');
    url.searchParams.set('id', settings.workspaceFolderId);
    chrome.tabs.create({ url: url.toString() });
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// 显示 Toast 消息
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
