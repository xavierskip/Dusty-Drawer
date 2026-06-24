// Popup 页面脚本

document.addEventListener('DOMContentLoaded', async () => {
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
