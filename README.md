# Tab Bookmark Saver - Chrome 扩展

一个帮助管理浏览器标签页和书签的 Chrome 扩展，形成工作循环。

## 功能特点

### 1. 收藏动作
- **右键菜单**：在页面右键选择"保存当前窗口标签页到工作区"
- **Popup 页面**：点击扩展图标，可自定义文件夹名称后保存
- 收藏后会自动关闭当前窗口

### 2. 新标签页
- 替换 Chrome 默认新标签页
- 显示当前打开的所有标签页（按窗口分组）
- 显示工作区中保存的书签文件夹
- 点击标签页可快速切换到对应窗口
- 点击书签文件夹可一键打开并删除
- 模拟 Chrome 书签栏显示

### 3. 设置页面
- 自定义工作区文件夹
- 控制新标签页是否显示书签栏
- 清空工作区功能

## 安装方法

### 开发者模式安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `src` 文件夹
5. 完成安装

## 使用方法

### 保存标签页
1. 右键点击任意页面，选择"保存当前窗口标签页到工作区"
2. 或点击扩展图标，输入文件夹名称（可选），点击"保存并关闭窗口"

### 管理工作区
1. 打开新标签页查看保存的书签
2. 点击书签文件夹的"打开"按钮，在新窗口打开所有书签
3. 打开后该文件夹会自动从工作区删除

### 设置
1. 点击新标签页的"设置"按钮
2. 或右键扩展图标选择"选项"

## 文件结构

```
src/
├── manifest.json      # 扩展配置
├── background.js      # 后台服务脚本
├── icons/             # 图标文件
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── popup/             # 弹出页面
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── newtab/            # 新标签页
│   ├── newtab.html
│   ├── newtab.css
│   └── newtab.js
└── options/           # 设置页面
    ├── options.html
    ├── options.css
    └── options.js
```

## 注意事项

- 首次使用时会自动创建一个名为"工作区"的书签文件夹
- 可以在设置中更改工作区文件夹
- 标签页变化时新标签页会自动刷新
- 新标签页扩展页面本身不会显示在打开的标签页列表中

## Icons

Please add the following icon files to this folder:

- `icon16.png` - 16x16 pixels
- `icon32.png` - 32x32 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

You can generate these icons from the SVG below or use any icon you prefer.

### Simple SVG Icon

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="20" fill="#1a73e8"/>
  <rect x="24" y="32" width="80" height="12" rx="6" fill="white"/>
  <rect x="24" y="52" width="60" height="12" rx="6" fill="white"/>
  <rect x="24" y="72" width="40" height="12" rx="6" fill="white"/>
  <rect x="24" y="92" width="70" height="12" rx="6" fill="white"/>
</svg>
```

Or you can download free icons from:
- [Flaticon](https://www.flaticon.com/)
- [Iconfinder](https://www.iconfinder.com/)
- [Material Icons](https://fonts.google.com/icons)

### Icon came form here
[icon128.png](https://www.flaticon.com/free-icon/poly-bag_11634280)