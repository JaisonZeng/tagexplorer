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

// TagRuleConfig 标签应用规则配置
type TagRuleConfig struct {
	Format       string            `json:"format"`        // 标签格式类型
	CustomFormat *CustomFormat     `json:"customFormat"`  // 自定义格式
	Position     string            `json:"position"`      // 标签位置 prefix/suffix
	AddSpaces    bool              `json:"addSpaces"`     // 是否添加空格
	Grouping     string            `json:"grouping"`      // 标签组合方式 combined/individual
}

// CustomFormat 自定义标签格式
type CustomFormat struct {
	Prefix    string `json:"prefix"`    // 前缀
	Suffix    string `json:"suffix"`    // 后缀
	Separator string `json:"separator"` // 分隔符
}

// AppSettings 应用设置
type AppSettings struct {
	TagRule TagRuleConfig `json:"tagRule"`
}
