# TagExplorer

TagExplorer 是一款基于 **Wails (Go)** 与 **React + TypeScript** 的桌面文件管理增强工具，聚焦标签化管理与安全的本地整理能力。

## 核心特性
- 多工作区支持：可添加多个文件夹或使用 `.teworkplace` 工作区文件管理项目集。
- 标签管理：本地 SQLite 存储标签与文件映射，支持颜色、自定义层级，文件名可按标签规则自动重命名。
- 高性能文件列表：虚拟滚动与分页加载，万级文件仍可流畅浏览。
- 预览能力：图片/视频缩略图（`ffmpeg`、`disintegration/imaging`），基础文件预览。
- 一键整理（新）：按配置的标签层级生成目录结构，支持预览→确认→执行→撤销，全程不对原文件做隐式修改。
- 数据主权：所有数据本地存储，默认位于用户配置目录，不依赖云端。

## 一键整理快速说明
1. 在菜单栏点击「整理」打开对话框。
2. 配置层级：每级可选择一个或多个标签（同级多标签会生成如 `[2025][02]` 的目录段）。
3. 点击「生成预览」：展示目标路径、冲突、缺少标签等信息，冲突未解决前无法执行。
4. 点击「执行整理」：实际移动文件并记录操作，可通过「撤销整理」恢复。

## 技术栈
- 后端：Go 1.24 + Wails v2，数据库 `modernc.org/sqlite`，日志 `zap`。
- 前端：React 18 + TypeScript + Vite，UI 使用 Tailwind CSS + shadcn/ui，状态管理 `Zustand`，虚拟列表 `react-window`，图标 `lucide-react`。
- 多媒体：`ffmpeg`（视频帧缩略图），`disintegration/imaging`（图片处理）。

## 开发与构建
- 依赖：Go 1.24+，Node 18+，本地可执行的 `ffmpeg`（可选，用于视频缩略图）。
- 安装前端依赖（首次或依赖变更）：
  ```bash
  cd frontend
  npm install
  ```
- 开发模式（含前后端联调）：
  ```bash
  wails dev
  ```
- 生成前端绑定（新增/修改导出 API 后）：
  ```bash
  wails generate
  ```
- 生产构建：
  ```bash
  wails build
  ```

## 目录结构速览
- `app.go`：应用入口与业务编排，暴露前端可调用接口。
- `internal/data`：SQLite 封装与批量导入、操作记录（整理/撤销）。
- `internal/workspace`：工作区扫描与文件元数据入库。
- `internal/api`：前后端共享 DTO 定义。
- `frontend/src`：React 前端（组件、store、types、utils）。
- `frontend/wailsjs`：Wails 自动生成的前端调用代码（不要手改）。

## 使用提示
- 整理/重命名/删除等会对文件系统产生影响的操作前请先预览或确认；工具不会在未确认的情况下移动文件。
- 若需要撤销整理，请确保仍在同一工作区，并使用「撤销整理」按钮按顺序回滚。***
