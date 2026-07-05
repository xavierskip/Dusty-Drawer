// Popup 页面脚本

import { STORAGE_KEY } from '/constants.js';

document.addEventListener('DOMContentLoaded', async () => {
  const hasWorkspace = await hasWorkspaceFolder();
  if (!hasWorkspace) {
    renderSetupRequired();
    return;
  }

  // 获取统计信息
  await loadStats();

  // 绑定保存按钮
  document.getElementById('saveBtn').addEventListener('click', saveTabs);

  // 按 Enter 键保存
  document.getElementById('folderName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveTabs();
    }
  });
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
  const container = document.querySelector('.container');
  container.innerHTML = `
    <div class="section">
      <h2>未设置工作区</h2>
      <p style="margin-bottom: 16px; color: #5f6368;">使用扩展前，请先在设置页面中选择或创建一个工作区文件夹。</p>
      <button id="openOptions" class="primary-btn">打开设置</button>
    </div>
    <div id="status" class="status"></div>
  `;

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// 加载统计信息
async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getWorkspaceBookmarks' });
    if (response.success) {
      const folders = response.bookmarks;
      const totalBookmarks = folders.reduce((sum, f) => sum + f.bookmarks.length, 0);

      document.getElementById('folderCount').textContent = folders.length;
      document.getElementById('bookmarkCount').textContent = totalBookmarks;
    }
  } catch (error) {
    console.error('获取统计信息失败:', error);
  }
}

// 保存标签页
async function saveTabs() {
  const folderName = document.getElementById('folderName').value.trim() || null;
  const saveBtn = document.getElementById('saveBtn');

  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveTabs',
      folderName: folderName
    });

    if (response.success) {
      showStatus('保存成功！', 'success');
      // 窗口会被关闭，所以这里的消息可能看不到
    } else {
      showStatus('保存失败: ' + response.error, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="icon">💾</span> 保存并关闭窗口';
    }
  } catch (error) {
    showStatus('保存失败: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="icon">💾</span> 保存并关闭窗口';
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
