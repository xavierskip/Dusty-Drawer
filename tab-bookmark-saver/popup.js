// ---------- 工具函数 ----------

// 把书签树拍平成"只含文件夹"的列表，带缩进层级，方便填进 <select>
function flattenFolders(rootNode) {
  const out = [];
  function walk(node, depth, path) {
    const isFolder = node.children !== undefined; // 有 children 字段代表文件夹，有 url 字段代表书签条目
    if (!isFolder) return;
    if (node.id !== '0') {
      const label = node.title || '(未命名文件夹)';
      out.push({
        id: node.id,
        depth,
        label,
        fullPath: path ? `${path} / ${label}` : label
      });
    }
    const childDepth = node.id === '0' ? 0 : depth + 1;
    const childPath = node.id === '0' ? '' : (path ? `${path} / ${node.title}` : node.title);
    (node.children || []).forEach(child => walk(child, childDepth, childPath));
  }
  walk(rootNode, 0, '');
  return out;
}

function fillFolderSelect(selectEl, folders, preferredId) {
  selectEl.innerHTML = '';
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = '\u3000'.repeat(f.depth) + f.label;
    selectEl.appendChild(opt);
  }
  if (preferredId && folders.some(f => f.id === preferredId)) {
    selectEl.value = preferredId;
  }
}

async function loadFolderLists() {
  const [tree] = await chrome.bookmarks.getTree();
  const folders = flattenFolders(tree);
  // 默认优先选中"其他书签"(id 通常为 2)，找不到就用第一个
  const otherId = folders.find(f => f.label.includes('其他') || f.id === '2')?.id;
  fillFolderSelect(folderSelect, folders, otherId || folders[0]?.id);
  fillFolderSelect(openFolderSelect, folders, otherId || folders[0]?.id);
}

function filterValidTabs(tabs) {
  return tabs
    .filter(t => t.url && !/^(chrome|chrome-extension|edge|about):/.test(t.url))
    .sort((a, b) => a.index - b.index);
}

function groupByWindow(tabs) {
  const map = new Map();
  for (const t of tabs) {
    if (!map.has(t.windowId)) map.set(t.windowId, []);
    map.get(t.windowId).push(t);
  }
  return map;
}

async function getExistingUrls(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  return new Set(children.filter(c => c.url).map(c => c.url));
}

async function saveTabsToFolder(tabs, folderId, skipDup) {
  const existing = skipDup ? await getExistingUrls(folderId) : null;
  let saved = 0;
  for (const tab of tabs) {
    if (skipDup && existing.has(tab.url)) continue;
    await chrome.bookmarks.create({
      parentId: folderId,
      title: tab.title || tab.url,
      url: tab.url
    });
    if (skipDup) existing.add(tab.url);
    saved++;
  }
  return saved;
}

async function getAllUrlsRecursive(folderId) {
  const [node] = await chrome.bookmarks.getSubTree(folderId);
  const urls = [];
  function walk(n) {
    if (n.url) urls.push(n.url);
    (n.children || []).forEach(walk);
  }
  walk(node);
  return urls;
}

function showStatus(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ---------- DOM ----------

const folderSelect = document.getElementById('folderSelect');
const newFolderName = document.getElementById('newFolderName');
const skipDupCheckbox = document.getElementById('skipDup');
const closeAfterCheckbox = document.getElementById('closeAfter');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');

const openFolderSelect = document.getElementById('openFolderSelect');
const removeAfterCheckbox = document.getElementById('removeAfter');
const openBtn = document.getElementById('openBtn');
const openStatus = document.getElementById('openStatus');

document.addEventListener('DOMContentLoaded', loadFolderLists);

// ---------- 保存 ----------

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  showStatus(saveStatus, '正在保存…');
  try {
    const scope = document.querySelector('input[name="scope"]:checked').value;
    const baseFolderId = folderSelect.value;
    const newName = newFolderName.value.trim();
    const skipDup = skipDupCheckbox.checked;
    const closeAfter = closeAfterCheckbox.checked;

    let targetFolderId = baseFolderId;
    if (newName) {
      const created = await chrome.bookmarks.create({ parentId: baseFolderId, title: newName });
      targetFolderId = created.id;
    }

    const rawTabs = scope === 'current'
      ? await chrome.tabs.query({ currentWindow: true })
      : await chrome.tabs.query({});
    const validTabs = filterValidTabs(rawTabs);

    if (validTabs.length === 0) {
      showStatus(saveStatus, '没有可保存的标签页', true);
      saveBtn.disabled = false;
      return;
    }

    let totalSaved = 0;
    const tabIdsToClose = [];

    if (scope === 'current') {
      totalSaved = await saveTabsToFolder(validTabs, targetFolderId, skipDup);
      tabIdsToClose.push(...validTabs.map(t => t.id));
    } else {
      const groups = groupByWindow(validTabs);
      let idx = 1;
      for (const [, winTabs] of groups) {
        const sub = await chrome.bookmarks.create({
          parentId: targetFolderId,
          title: `窗口 ${idx++}（${winTabs.length} 个标签）`
        });
        totalSaved += await saveTabsToFolder(winTabs, sub.id, skipDup);
        tabIdsToClose.push(...winTabs.map(t => t.id));
      }
    }

    if (closeAfter && tabIdsToClose.length) {
      await chrome.tabs.remove(tabIdsToClose);
    }

    newFolderName.value = '';
    showStatus(saveStatus, `已保存 ${totalSaved} 个标签页`);
    await loadFolderLists();
  } catch (err) {
    showStatus(saveStatus, `出错：${err.message}`, true);
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- 打开 ----------

openBtn.addEventListener('click', async () => {
  openBtn.disabled = true;
  showStatus(openStatus, '正在打开…');
  try {
    const folderId = openFolderSelect.value;
    const removeAfter = removeAfterCheckbox.checked;

    const urls = await getAllUrlsRecursive(folderId);
    if (urls.length === 0) {
      showStatus(openStatus, '该文件夹内没有可打开的链接', true);
      openBtn.disabled = false;
      return;
    }

    await chrome.windows.create({ url: urls });

    if (removeAfter) {
      await chrome.bookmarks.removeTree(folderId);
      await loadFolderLists();
    }

    showStatus(openStatus, `已在新窗口打开 ${urls.length} 个链接`);
  } catch (err) {
    showStatus(openStatus, `出错：${err.message}`, true);
  } finally {
    openBtn.disabled = false;
  }
});
