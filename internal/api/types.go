package api

// Workspace 提供给前端的工作区描述
type Workspace struct {
	ID        int64  `json:"id"`
	Path      string `json:"path"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

// Tag 代表标签定义
type Tag struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	ParentID *int64 `json:"parent_id,omitempty"`
}

// ScanResult 前端使用的扫描结果
type ScanResult struct {
	Workspace      Workspace `json:"workspace"`
	FileCount      int       `json:"file_count"`
	DirectoryCount int       `json:"directory_count"`
}

// FileRecord 是文件列表的前端投影
type FileRecord struct {
	ID          int64  `json:"id"`
	WorkspaceID int64  `json:"workspace_id"`
	Path        string `json:"path"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	Type        string `json:"type"`
	ModTime     string `json:"mod_time"`
	CreatedAt   string `json:"created_at"`
	Hash        string `json:"hash"`
	Tags        []Tag  `json:"tags"`
}

// FilePage 描述分页结果
type FilePage struct {
	Total   int64        `json:"total"`
	Records []FileRecord `json:"records"`
}
