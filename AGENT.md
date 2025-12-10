你是一名精通 **Wails (Go)** 和 **React (TypeScript)** 的全栈架构师。我们要开发一款名为 **"TagExplorer"** 的桌面端文件管理增强工具。

**核心理念：**
- **非侵入式管理**：用户选择一个文件夹作为“工作区”。所有的标签、备注、规则都存储在本地 SQLite 数据库中，**绝不修改**原始文件（除非用户显式执行“整理”操作）。
- **高性能**：必须能够流畅处理包含数万个文件的工作区（使用虚拟列表）。
- **数据主权**：所有数据本地存储，不依赖云端。

**技术栈约束（严格遵守）：**
- **框架**：Wails
- **后端**：Go (Golang)
- **前端**：React + TypeScript + Vite
- **样式**：Tailwind CSS + shadcn/ui (或 Ant Design)
- **状态管理**：Zustand
- **数据库**：SQLite (使用 `modernc.org/sqlite` 驱动，避免 CGO 问题)
- **列表性能**：react-window (用于虚拟滚动)
- **多媒体**：ffmpeg (通过 os/exec 调用，用于视频缩略图), disintegration/imaging (图片处理)
