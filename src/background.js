// 后台服务脚本

// 默认存储键
const STORAGE_KEY = 'tabBookmarkSaver';
const DEFAULT_FOLDER_NAME = '工作区';

// return tabGroup color randomly
function randomGroupColor() {
  const colors = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  return colors[Math.floor(Math.random() * colors.length)];
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'saveTabsToWorkspace',
    title: '保存当前窗口标签页到工作区',
    contexts: ['page']
  });

  // 初始化存储
  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    if (!result[STORAGE_KEY]) {
      chrome.storage.sync.set({
        [STORAGE_KEY]: {
          workspaceFolderId: null,
          showBookmarkBar: true
        }
      });
    }
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveTabsToWorkspace') {
    saveCurrentWindowTabs();
  }
});

// 保存当前窗口的标签页到工作区（使用默认名称）
async function saveCurrentWindowTabs(customName = null) {
  try {
    // 获取当前窗口
    const currentWindow = await chrome.windows.getCurrent({ populate: true });

    // 过滤掉新标签页扩展自身的页面
    const tabsToSave = currentWindow.tabs.filter(tab => {
      return !tab.url.startsWith('chrome-extension://') &&
             !tab.url.startsWith('chrome://newtab');
    });

    if (tabsToSave.length === 0) {
      console.log('没有可保存的标签页');
      return;
    }

    // 获取或创建工作区文件夹
    const workspaceFolderId = await getOrCreateWorkspaceFolder();

    // 生成文件夹名称
    const folderName = customName || getDefaultFolderName();

    // 在工作区下创建新文件夹
    const newFolder = await chrome.bookmarks.create({
      parentId: workspaceFolderId,
      title: folderName
    });

    // 将标签页保存为书签
    const bookmarkPromises = tabsToSave.map(tab =>
      chrome.bookmarks.create({
        parentId: newFolder.id,
        title: tab.title,
        url: tab.url
      })
    );

    await Promise.all(bookmarkPromises);

    // 关闭当前窗口
    await chrome.windows.remove(currentWindow.id);

    console.log(`已保存 ${tabsToSave.length} 个标签页到工作区`);
  } catch (error) {
    console.error('保存标签页失败:', error);
  }
}

// 获取默认文件夹名称（当前时间）
function getDefaultFolderName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 获取或创建工作区文件夹
async function getOrCreateWorkspaceFolder() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const config = result[STORAGE_KEY] || {};

  if (config.workspaceFolderId) {
    try {
      // 检查文件夹是否存在
      const folder = await chrome.bookmarks.get(config.workspaceFolderId);
      if (folder && folder.length > 0) {
        return config.workspaceFolderId;
      }
    } catch (e) {
      // 文件夹不存在，创建新的
    }
  }

  // 创建新的工作区文件夹
  const newFolder = await chrome.bookmarks.create({
    title: DEFAULT_FOLDER_NAME
  });

  // 保存文件夹ID
  config.workspaceFolderId = newFolder.id;
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });

  return newFolder.id;
}

// 监听标签页变化，通知所有新标签页刷新
// chrome.tabs.onCreated.addListener(() => notifyNewTabRefresh());
// chrome.tabs.onRemoved.addListener(() => notifyNewTabRefresh());
// chrome.tabs.onMoved.addListener(() => notifyNewTabRefresh());
// chrome.tabs.onAttached.addListener(() => notifyNewTabRefresh());
// chrome.tabs.onDetached.addListener(() => notifyNewTabRefresh());
// chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
//   if (changeInfo.title || changeInfo.url) {
//     notifyNewTabRefresh();
//   }
// });
// chrome.windows.onCreated.addListener(() => notifyNewTabRefresh());
// chrome.windows.onRemoved.addListener(() => notifyNewTabRefresh());

// 通知所有新标签页刷新
// function notifyNewTabRefresh() {
//   chrome.runtime.sendMessage({ action: 'refreshTabs' }).catch(() => {
//     // 忽略错误（可能没有打开的新标签页在监听）
//   });
// }

// 处理来自 popup 和 newtab 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveTabs') {
    saveCurrentWindowTabs(request.folderName).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持消息通道开启
  }

  if (request.action === 'getWorkspaceBookmarks') {
    getWorkspaceBookmarks().then((bookmarks) => {
      sendResponse({ success: true, bookmarks });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'getAllWindows') {
    getAllWindows(request.filterText).then((windows) => {
      sendResponse({ success: true, windows });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'activateTab') {
    activateTab(request.windowId, request.tabId).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'openBookmarkFolder') {
    openBookmarkFolder(request.folderId, request.asTabGroup).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'getBookmarkBar') {
    getBookmarkBar().then((bookmarks) => {
      sendResponse({ success: true, bookmarks });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// 获取工作区的书签
async function getWorkspaceBookmarks() {
  const workspaceFolderId = await getOrCreateWorkspaceFolder();
  const bookmarks = await chrome.bookmarks.getChildren(workspaceFolderId);

  // 只返回文件夹，按创建时间倒序
  const folders = bookmarks
    .filter(b => !b.url) // 只保留文件夹
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

  // 获取每个文件夹内的书签
  const result = [];
  for (const folder of folders) {
    const children = await chrome.bookmarks.getChildren(folder.id);
    result.push({
      id: folder.id,
      title: folder.title,
      dateAdded: folder.dateAdded,
      bookmarks: children.filter(b => b.url).map(b => ({
        id: b.id,
        title: b.title,
        url: b.url
      }))
    });
  }

  return result;
}

// 获取所有窗口和标签页
async function getAllWindows(filterText='') {
  const windows = await chrome.windows.getAll({ populate: true });

  // 过滤掉新标签页扩展自身的页面
  return windows.map(w => {
    if (filterText === ''){
      var validTabs = w.tabs;
    } else{
      var validTabs = w.tabs.filter(t => {
        const host = new URL(t.url).hostname || new URL(t.url).href;
        return t.title.toLowerCase().includes(filterText) || host.toLowerCase().includes(filterText);
      });
    }
    // 获取窗口标题：如果有活动标签页用活动标签页标题，否则用第一个标签页标题
    const activeTab = validTabs.find(t => t.active);
    const windowTitle = activeTab ? activeTab.title : (validTabs[0] ? validTabs[0].title : '未命名窗口');

    return {
      id: w.id,
      focused: w.focused,
      title: windowTitle,
      tabs: validTabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favIconUrl: t.favIconUrl,
        active: t.active
      }))
    };
  }).filter(w => w.tabs.length > 0);
}

// 激活指定窗口和标签页
async function activateTab(windowId, tabId) {
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
}

// 打开书签文件夹中的所有书签
async function openBookmarkFolder(folderId, asTabGroup = false) {
  const bookmarks = await chrome.bookmarks.getChildren(folderId);
  const urls = bookmarks
    .filter(b => b.url)
    .map(b => b.url);

  if (urls.length === 0) {
    throw new Error('文件夹为空');
  }

  // 在新窗口中打开所有书签
  const newWindow = await chrome.windows.create({url: urls});

  if (asTabGroup === true) {
    // 获取文件夹名称
    const [folder] = await chrome.bookmarks.get(folderId);
    // 拿到所有 tabId
    const tabIds = newWindow.tabs.map(t => t.id);
    // 创建 tab group
    const groupId = await chrome.tabs.group({
      tabIds,
      createProperties: { windowId: newWindow.id },
    });
    // 以书签文件夹名称命名
    await chrome.tabGroups.update(groupId, {
      title: folder.title,
      color: randomGroupColor(),
    });
  };

  // 删除书签文件夹
  await chrome.bookmarks.removeTree(folderId);

  return newWindow;
}

// 获取书签栏内容
async function getBookmarkBar() {
  const bookmarkBar = await chrome.bookmarks.getTree();
  // 书签栏是树根的第一个子节点
  const barNode = bookmarkBar[0].children.find(node => node.id === '1');
  if (!barNode) return [];

  const processNode = async (node) => {
    if (node.url) {
      return {
        id: node.id,
        title: node.title,
        url: node.url
      };
    } else {
      const children = await chrome.bookmarks.getChildren(node.id);
      return {
        id: node.id,
        title: node.title,
        children: await Promise.all(children.map(processNode))
      };
    }
  };

  const children = await chrome.bookmarks.getChildren(barNode.id);
  return Promise.all(children.map(processNode));
}
