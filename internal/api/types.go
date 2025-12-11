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
	Format       string        `json:"format"`       // 标签格式类型
	CustomFormat *CustomFormat `json:"customFormat"` // 自定义格式
	Position     string        `json:"position"`     // 标签位置 prefix/suffix
	AddSpaces    bool          `json:"addSpaces"`    // 是否添加空格
	Grouping     string        `json:"grouping"`     // 标签组合方式 combined/individual
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

// FileSearchParams 文件搜索参数
type FileSearchParams struct {
	TagIDs            []int64 `json:"tag_ids"`            // 要筛选的标签ID列表
	FolderPath        string  `json:"folder_path"`        // 文件夹路径（相对路径），为空则搜索整个工作区
	IncludeSubfolders bool    `json:"include_subfolders"` // 是否包含子文件夹
	Limit             int     `json:"limit"`
	Offset            int     `json:"offset"`
}

// OrganizeLevel 描述单层需要匹配的标签（同级可以配置多个标签）
type OrganizeLevel struct {
	TagIDs []int64 `json:"tag_ids"`
}

// OrganizeRequest 代表整理请求
type OrganizeRequest struct {
	Levels []OrganizeLevel `json:"levels"`
}

// OrganizePreviewItem 代表一次整理中的单个文件预览
type OrganizePreviewItem struct {
	FileID       int64    `json:"file_id"`
	OriginalPath string   `json:"original_path"` // 相对路径，包含文件名
	TargetPath   string   `json:"target_path"`   // 相对路径，包含文件名
	Status       string   `json:"status"`        // move/conflict/skip_missing_tags/already_in_place
	MissingTags  []string `json:"missing_tags,omitempty"`
	Tags         []string `json:"tags,omitempty"`
	Message      string   `json:"message,omitempty"`
}

// OrganizeSummary 汇总统计
type OrganizeSummary struct {
	Total          int `json:"total"`
	MoveCount      int `json:"move_count"`
	ConflictCount  int `json:"conflict_count"`
	SkipCount      int `json:"skip_count"`
	AlreadyInPlace int `json:"already_in_place"`
}

// OrganizePreview 预览结果
type OrganizePreview struct {
	Items    []OrganizePreviewItem `json:"items"`
	Summary  OrganizeSummary       `json:"summary"`
	BasePath string                `json:"base_path"`
}

// OrganizeMoveRecord 用于记录一次整理的单个移动
type OrganizeMoveRecord struct {
	FileID int64  `json:"file_id"`
	From   string `json:"from"` // 相对路径（包含文件名）
	To     string `json:"to"`   // 相对路径（包含文件名）
}

// OrganizeOperationPayload 存储在 operations.payload 中，便于撤销
type OrganizeOperationPayload struct {
	WorkspaceID int64                `json:"workspace_id"`
	Moves       []OrganizeMoveRecord `json:"moves"`
}

// OrganizeResult 执行整理后的结果
type OrganizeResult struct {
	Preview     OrganizePreview `json:"preview"`
	OperationID int64           `json:"operation_id"`
}

// OrganizeUndoResult 撤销整理的结果
type OrganizeUndoResult struct {
	Restored int    `json:"restored"`
	Failed   int    `json:"failed"`
	Message  string `json:"message,omitempty"`
}
