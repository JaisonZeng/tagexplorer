/**
 * Chonky 中文本地化配置
 */
import {ChonkyActions, setChonkyDefaults, I18nConfig} from "chonky";

// 中文本地化字符串
export const zhCN: I18nConfig = {
  locale: "zh-CN",
  formatters: {
    formatFileModDate: (_intl, file) => {
      if (!file || !file.modDate) return null;
      const date = new Date(file.modDate);
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    formatFileSize: (_intl, file) => {
      if (!file || file.size === undefined || file.size === null) return null;
      const size = file.size;
      if (size === 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let value = size;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      const precision = value >= 10 ? 0 : 1;
      return `${value.toFixed(precision)} ${units[unitIndex]}`;
    },
  },
  messages: {
    // 工具栏
    "chonky.toolbar.searchPlaceholder": "搜索文件...",
    "chonky.toolbar.visibleFileCount": "{fileCount, plural, one {# 个项目} other {# 个项目}}",
    "chonky.toolbar.selectedFileCount": "({fileCount} 已选中)",
    "chonky.toolbar.hiddenFileCount": "({fileCount} 已隐藏)",

    // 文件浏览器
    "chonky.folderChainPlaceholder": "无文件夹链",

    // 文件操作分组
    "chonky.actionGroups.Actions": "操作",
    "chonky.actionGroups.Options": "选项",

    // 右键菜单
    "chonky.contextMenu.browserMenuShortcut": "浏览器菜单: {shortcut}",

    // 内置文件操作按钮
    [`chonky.actions.${ChonkyActions.OpenSelection.id}.button.name`]: "打开选中项",
    [`chonky.actions.${ChonkyActions.SelectAllFiles.id}.button.name`]: "全选",
    [`chonky.actions.${ChonkyActions.ClearSelection.id}.button.name`]: "取消选择",
    [`chonky.actions.${ChonkyActions.EnableListView.id}.button.name`]: "列表视图",
    [`chonky.actions.${ChonkyActions.EnableGridView.id}.button.name`]: "网格视图",
    [`chonky.actions.${ChonkyActions.EnableCompactView.id}.button.name`]: "紧凑视图",
    [`chonky.actions.${ChonkyActions.SortFilesByName.id}.button.name`]: "按名称排序",
    [`chonky.actions.${ChonkyActions.SortFilesBySize.id}.button.name`]: "按大小排序",
    [`chonky.actions.${ChonkyActions.SortFilesByDate.id}.button.name`]: "按日期排序",
    [`chonky.actions.${ChonkyActions.ToggleHiddenFiles.id}.button.name`]: "显示隐藏文件",
    [`chonky.actions.${ChonkyActions.ToggleShowFoldersFirst.id}.button.name`]: "文件夹优先",
    [`chonky.actions.${ChonkyActions.FocusSearchInput.id}.button.name`]: "搜索",
    [`chonky.actions.${ChonkyActions.OpenFiles.id}.button.name`]: "打开",

    // 自定义操作
    "chonky.actions.tag_file.button.name": "管理标签",
    "chonky.actions.preview_file.button.name": "预览",

    // 文件条目
    "chonky.fileEntry.loading": "加载中...",
    "chonky.fileEntry.clickToSelect": "点击选择",
    "chonky.fileEntry.ctrlClickToSelect": "Ctrl+点击多选",
    "chonky.fileEntry.shiftClickToSelect": "Shift+点击范围选择",

    // 空状态
    "chonky.fileList.nothingToShow": "没有可显示的文件",

    // 文件大小
    "chonky.fileSize.symlink": "符号链接",
    "chonky.fileSize.encrypted": "已加密",
  },
};

// 应用中文配置
export const applyChonkyI18n = () => {
  setChonkyDefaults({i18n: zhCN});
};
