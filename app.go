package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/disintegration/imaging"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.uber.org/zap"

	"tagexplorer/internal/api"
	"tagexplorer/internal/data"
	"tagexplorer/internal/logging"
	"tagexplorer/internal/workspace"
)

// App 负责整体业务编排
type App struct {
	ctx     context.Context
	db      *data.Database
	scanner *workspace.Scanner
	logger  *zap.Logger

	logCleanup       func()
	currentWorkspace *data.Workspace
	settings         *api.AppSettings
}

// NewApp 创建应用实例
func NewApp() *App {
	return &App{}
}

// startup 初始化运行环境
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	configRoot, err := os.UserConfigDir()
	if err != nil {
		runtime.LogFatalf(ctx, "获取用户配置目录失败: %v", err)
		return
	}

	configDir := filepath.Join(configRoot, "tagexplorer")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		runtime.LogFatalf(ctx, "创建配置目录失败: %v", err)
		return
	}

	logPath := filepath.Join(configDir, "logs", "tagexplorer.log")
	logger, cleanup, err := logging.NewLogger(logPath)
	if err != nil {
		runtime.LogFatalf(ctx, "初始化日志失败: %v", err)
		return
	}
	a.logger = logger
	a.logCleanup = cleanup

	dbPath := filepath.Join(configDir, "tagexplorer.db")
	db, err := data.NewDatabase(dbPath)
	if err != nil {
		a.logger.Error("初始化数据库失败", zap.String("path", dbPath), zap.Error(err))
		runtime.LogFatalf(ctx, "初始化数据库失败: %v", err)
		return
	}

	if err := db.InitDB(ctx); err != nil {
		a.logger.Error("创建数据库结构失败", zap.String("path", dbPath), zap.Error(err))
		runtime.LogFatalf(ctx, "创建数据库结构失败: %v", err)
		return
	}

	a.db = db
	a.scanner = workspace.NewScanner(db, a.logger)

	// 初始化默认设置
	a.settings = &api.AppSettings{
		TagRule: api.TagRuleConfig{
			Format:    "square_brackets",
			Position:  "suffix",
			AddSpaces: true,
			Grouping:  "combined",
		},
	}

	// 从数据库加载设置
	if err := a.loadSettingsFromDB(); err != nil {
		if a.logger != nil {
			a.logger.Warn("从数据库加载设置失败，使用默认设置", zap.Error(err))
		}
	}
}

// shutdown 释放资源
func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		if err := a.db.Close(); err != nil {
			runtime.LogErrorf(ctx, "关闭数据库失败: %v", err)
			if a.logger != nil {
				a.logger.Error("关闭数据库失败", zap.Error(err))
			}
		}
	}

	if a.logCleanup != nil {
		a.logCleanup()
		a.logCleanup = nil
	}
}

// Greet 返回欢迎词（保留样例接口）
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// GetSettings 获取应用设置
func (a *App) GetSettings() (*api.AppSettings, error) {
	if a.settings == nil {
		return nil, errors.New("设置尚未初始化")
	}
	return a.settings, nil
}

// UpdateSettings 更新应用设置
func (a *App) UpdateSettings(settings *api.AppSettings) error {
	if settings == nil {
		return errors.New("设置不能为空")
	}

	// 验证设置
	if err := a.validateSettings(settings); err != nil {
		return fmt.Errorf("设置验证失败: %w", err)
	}

	// 检查标签格式是否发生变化
	formatChanged := a.settings == nil ||
		a.settings.TagRule.Format != settings.TagRule.Format ||
		a.settings.TagRule.Position != settings.TagRule.Position ||
		a.settings.TagRule.AddSpaces != settings.TagRule.AddSpaces

	// 如果是自定义格式，还需要检查自定义格式设置
	if settings.TagRule.Format == "custom" {
		if a.settings == nil || a.settings.TagRule.CustomFormat == nil || settings.TagRule.CustomFormat == nil {
			formatChanged = true
		} else {
			formatChanged = formatChanged ||
				a.settings.TagRule.CustomFormat.Prefix != settings.TagRule.CustomFormat.Prefix ||
				a.settings.TagRule.CustomFormat.Suffix != settings.TagRule.CustomFormat.Suffix ||
				a.settings.TagRule.CustomFormat.Separator != settings.TagRule.CustomFormat.Separator
		}
	}

	a.settings = settings

	// 保存设置到数据库
	if err := a.saveSettingsToDB(); err != nil {
		if a.logger != nil {
			a.logger.Error("保存设置到数据库失败", zap.Error(err))
		}
		// 不返回错误，设置已经在内存中更新
	}

	if a.logger != nil {
		a.logger.Info("更新应用设置",
			zap.String("tag_format", settings.TagRule.Format),
			zap.String("tag_position", settings.TagRule.Position),
			zap.Bool("add_spaces", settings.TagRule.AddSpaces),
			zap.Bool("format_changed", formatChanged),
		)
	}

	// 如果标签格式发生变化且有当前工作区，批量更新文件名
	if formatChanged && a.currentWorkspace != nil {
		go func() {
			if err := a.batchUpdateFileNamesWithNewFormat(); err != nil {
				if a.logger != nil {
					a.logger.Error("批量更新文件名格式失败", zap.Error(err))
				}
			}
		}()
	}

	return nil
}

// batchUpdateFileNamesWithNewFormat 批量更新文件名以应用新的标签格式
func (a *App) batchUpdateFileNamesWithNewFormat() error {
	if a.db == nil || a.currentWorkspace == nil {
		return errors.New("数据库或工作区尚未准备就绪")
	}

	if a.logger != nil {
		a.logger.Info("开始批量更新文件名标签格式",
			zap.Int64("workspace_id", a.currentWorkspace.ID),
		)
	}

	const batchSize = 100
	offset := 0
	updatedCount := 0

	for {
		// 获取一批文件
		page, err := a.db.ListFiles(a.ctx, a.currentWorkspace.ID, batchSize, offset)
		if err != nil {
			return fmt.Errorf("获取文件列表失败: %w", err)
		}

		if len(page.Records) == 0 {
			break
		}

		// 处理当前批次的文件
		for _, file := range page.Records {
			// 只处理有标签的普通文件
			if file.Type != data.FileTypeRegular || len(file.Tags) == 0 {
				continue
			}

			// 尝试重命名文件以应用新格式
			if err := a.RenameFileWithTags(file.ID); err != nil {
				if a.logger != nil {
					a.logger.Warn("更新文件标签格式失败",
						zap.Int64("file_id", file.ID),
						zap.String("file_name", file.Name),
						zap.Error(err),
					)
				}
				// 继续处理其他文件
				continue
			}

			updatedCount++
		}

		// 如果返回的记录数少于批次大小，说明已经处理完所有文件
		if len(page.Records) < batchSize {
			break
		}

		offset += batchSize
	}

	if a.logger != nil {
		a.logger.Info("完成批量更新文件名标签格式",
			zap.Int64("workspace_id", a.currentWorkspace.ID),
			zap.Int("updated_count", updatedCount),
		)
	}

	return nil
}

// validateSettings 验证设置的有效性
func (a *App) validateSettings(settings *api.AppSettings) error {
	// 验证标签格式
	validFormats := map[string]bool{
		"brackets":        true,
		"square_brackets": true,
		"parentheses":     true,
		"custom":          true,
	}

	if !validFormats[settings.TagRule.Format] {
		return errors.New("无效的标签格式")
	}

	// 验证标签位置
	validPositions := map[string]bool{
		"prefix": true,
		"suffix": true,
	}

	if !validPositions[settings.TagRule.Position] {
		return errors.New("无效的标签位置")
	}

	// 验证标签组合方式
	validGroupings := map[string]bool{
		"combined":   true,
		"individual": true,
	}

	if !validGroupings[settings.TagRule.Grouping] {
		return errors.New("无效的标签组合方式")
	}

	// 如果是自定义格式，验证自定义格式设置
	if settings.TagRule.Format == "custom" {
		if settings.TagRule.CustomFormat == nil {
			return errors.New("自定义格式时必须提供自定义格式设置")
		}

		// 验证自定义格式字符是否包含文件名不允许的字符
		customFormat := settings.TagRule.CustomFormat
		if err := a.validateFileNameChars(customFormat.Prefix, "前缀"); err != nil {
			return err
		}
		if err := a.validateFileNameChars(customFormat.Suffix, "后缀"); err != nil {
			return err
		}
		if err := a.validateFileNameChars(customFormat.Separator, "分隔符"); err != nil {
			return err
		}
	}

	return nil
}

// validateFileNameChars 验证字符串是否包含文件名不允许的字符
func (a *App) validateFileNameChars(input, fieldName string) error {
	if input == "" {
		return nil
	}

	// Windows 文件名不允许的字符
	invalidChars := []string{"<", ">", ":", "\"", "|", "?", "*"}

	for _, char := range invalidChars {
		if strings.Contains(input, char) {
			if a.logger != nil {
				a.logger.Warn("检测到文件名不允许的字符，将自动替换",
					zap.String("field", fieldName),
					zap.String("input", input),
					zap.String("invalid_char", char),
				)
			}
			// 不返回错误，而是记录警告，让系统自动清理
			break
		}
	}

	return nil
}

// UpdateTagColor 更新标签颜色
func (a *App) UpdateTagColor(id int64, color string) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if err := a.db.UpdateTagColor(a.ctx, id, color); err != nil {
		if a.logger != nil {
			a.logger.Error("更新标签颜色失败", zap.Int64("tag_id", id), zap.String("color", color), zap.Error(err))
		}
		return err
	}
	return nil
}

// AddWorkspaceFolder 添加文件夹到工作区
func (a *App) AddWorkspaceFolder() (*api.ScanResult, error) {
	if a.ctx == nil {
		return nil, errors.New("应用尚未完成初始化")
	}

	selectedPath, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "添加文件夹到工作区",
	})
	if err != nil {
		return nil, fmt.Errorf("打开目录选择对话框失败: %w", err)
	}

	if selectedPath == "" {
		return nil, nil
	}

	return a.scanFolder(selectedPath)
}

// RemoveWorkspaceFolder 从工作区移除文件夹
func (a *App) RemoveWorkspaceFolder(workspaceID int64) error {
	// 这里只是从当前会话中移除，不删除数据库记录
	// 因为用户可能还想保留历史数据
	if a.currentWorkspace != nil && a.currentWorkspace.ID == workspaceID {
		a.currentWorkspace = nil
	}
	return nil
}

// GetWorkspaceFolders 获取所有工作区文件夹
func (a *App) GetWorkspaceFolders() ([]api.Workspace, error) {
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}

	workspaces, err := a.db.ListWorkspaces(a.ctx)
	if err != nil {
		return nil, err
	}

	result := make([]api.Workspace, 0, len(workspaces))
	for _, ws := range workspaces {
		result = append(result, toAPIWorkspace(&ws))
	}
	return result, nil
}

// SetActiveWorkspace 设置当前活动的工作区
func (a *App) SetActiveWorkspace(workspaceID int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}

	// 获取工作区信息
	workspace, err := a.db.GetWorkspaceByID(a.ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("获取工作区信息失败: %w", err)
	}

	a.currentWorkspace = workspace

	if a.logger != nil {
		a.logger.Info("切换活动工作区",
			zap.Int64("workspace_id", workspaceID),
			zap.String("workspace_path", workspace.Path),
		)
	}

	return nil
}

// WorkspaceConfig 工作区配置文件结构
type WorkspaceConfig struct {
	Name      string    `json:"name"`
	Folders   []string  `json:"folders"`
	CreatedAt time.Time `json:"created_at"`
	Version   string    `json:"version"`
	// FilePath 是工作区配置文件的路径（仅在加载时填充，不保存到文件）
	FilePath string `json:"file_path,omitempty"`
}

// SaveWorkspaceConfig 保存工作区配置到文件
func (a *App) SaveWorkspaceConfig(name string, folders []string) (string, error) {
	if a.ctx == nil {
		return "", errors.New("应用尚未完成初始化")
	}
	if name == "" {
		return "", errors.New("工作区名称不能为空")
	}
	if len(folders) == 0 {
		return "", errors.New("工作区必须包含至少一个文件夹")
	}

	// 让用户选择保存位置
	selectedPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "保存工作区配置",
		DefaultFilename: name + ".teworkplace",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "TagExplorer 工作区文件 (*.teworkplace)",
				Pattern:     "*.teworkplace",
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("打开保存对话框失败: %w", err)
	}
	if selectedPath == "" {
		return "", nil // 用户取消
	}

	// 确保文件扩展名正确
	if !strings.HasSuffix(strings.ToLower(selectedPath), ".teworkplace") {
		selectedPath += ".teworkplace"
	}

	// 创建配置对象
	config := WorkspaceConfig{
		Name:      name,
		Folders:   folders,
		CreatedAt: time.Now().UTC(),
		Version:   "1.0",
	}

	// 序列化为 JSON
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", fmt.Errorf("序列化配置失败: %w", err)
	}

	// 写入文件
	if err := os.WriteFile(selectedPath, data, 0644); err != nil {
		return "", fmt.Errorf("保存配置文件失败: %w", err)
	}

	if a.logger != nil {
		a.logger.Info("保存工作区配置成功",
			zap.String("name", name),
			zap.String("path", selectedPath),
			zap.Strings("folders", folders),
		)
	}

	return selectedPath, nil
}

// UpdateWorkspaceConfig 更新已有的工作区配置文件（不弹出对话框）
func (a *App) UpdateWorkspaceConfig(filePath string, name string, folders []string) error {
	if a.ctx == nil {
		return errors.New("应用尚未完成初始化")
	}
	if filePath == "" {
		return errors.New("文件路径不能为空")
	}
	if name == "" {
		return errors.New("工作区名称不能为空")
	}
	if len(folders) == 0 {
		return errors.New("工作区必须包含至少一个文件夹")
	}

	// 读取现有配置以保留 CreatedAt
	var existingConfig WorkspaceConfig
	if data, err := os.ReadFile(filePath); err == nil {
		_ = json.Unmarshal(data, &existingConfig)
	}

	createdAt := existingConfig.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	// 创建配置对象
	config := WorkspaceConfig{
		Name:      name,
		Folders:   folders,
		CreatedAt: createdAt,
		Version:   "1.0",
	}

	// 序列化为 JSON
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	// 写入文件
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("保存配置文件失败: %w", err)
	}

	if a.logger != nil {
		a.logger.Info("更新工作区配置成功",
			zap.String("name", name),
			zap.String("path", filePath),
			zap.Strings("folders", folders),
		)
	}

	return nil
}

// LoadWorkspaceConfig 加载工作区配置文件
func (a *App) LoadWorkspaceConfig() (*WorkspaceConfig, error) {
	if a.ctx == nil {
		return nil, errors.New("应用尚未完成初始化")
	}

	// 让用户选择配置文件
	selectedPath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开工作区配置",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "TagExplorer 工作区文件 (*.teworkplace)",
				Pattern:     "*.teworkplace",
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("打开文件对话框失败: %w", err)
	}
	if selectedPath == "" {
		return nil, nil // 用户取消
	}

	// 读取文件
	data, err := os.ReadFile(selectedPath)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	// 解析 JSON
	var config WorkspaceConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	// 验证配置
	if config.Name == "" {
		return nil, errors.New("配置文件中缺少工作区名称")
	}
	if len(config.Folders) == 0 {
		return nil, errors.New("配置文件中没有文件夹")
	}

	// 验证文件夹是否存在
	var validFolders []string
	for _, folder := range config.Folders {
		if _, err := os.Stat(folder); err == nil {
			validFolders = append(validFolders, folder)
		} else {
			if a.logger != nil {
				a.logger.Warn("工作区文件夹不存在", zap.String("path", folder))
			}
		}
	}

	if len(validFolders) == 0 {
		return nil, errors.New("配置文件中的所有文件夹都不存在")
	}

	config.Folders = validFolders

	// 设置文件路径
	config.FilePath = selectedPath

	// 记录到最近打开列表
	if err := a.db.AddRecentItem(a.ctx, "workspace", selectedPath, config.Name); err != nil {
		if a.logger != nil {
			a.logger.Warn("记录最近打开项目失败", zap.String("path", selectedPath), zap.Error(err))
		}
	}

	if a.logger != nil {
		a.logger.Info("加载工作区配置成功",
			zap.String("name", config.Name),
			zap.String("path", selectedPath),
			zap.Strings("folders", config.Folders),
		)
	}

	return &config, nil
}

// RecentItem 最近打开的项目（用于前端）
type RecentItem struct {
	ID       int64  `json:"id"`
	Type     string `json:"type"`
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt string `json:"opened_at"`
}

// GetRecentItems 获取最近打开的项目列表
func (a *App) GetRecentItems() ([]RecentItem, error) {
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}

	items, err := a.db.GetRecentItems(a.ctx, 5)
	if err != nil {
		if a.logger != nil {
			a.logger.Error("获取最近项目失败", zap.Error(err))
		}
		return nil, err
	}

	// 过滤掉不存在的路径
	var validItems []RecentItem
	for _, item := range items {
		if _, err := os.Stat(item.Path); err == nil {
			validItems = append(validItems, RecentItem{
				ID:       item.ID,
				Type:     item.Type,
				Path:     item.Path,
				Name:     item.Name,
				OpenedAt: item.OpenedAt.Format("2006-01-02 15:04"),
			})
		} else {
			// 路径不存在，从数据库中移除
			_ = a.db.RemoveRecentItem(a.ctx, item.Path)
		}
	}

	return validItems, nil
}

// OpenRecentItem 打开最近的项目
func (a *App) OpenRecentItem(path string, itemType string) (*api.ScanResult, error) {
	if a.ctx == nil {
		return nil, errors.New("应用尚未完成初始化")
	}

	if itemType == "workspace" {
		// 读取工作区配置文件
		fileData, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}

		var config WorkspaceConfig
		if err := json.Unmarshal(fileData, &config); err != nil {
			return nil, fmt.Errorf("解析配置文件失败: %w", err)
		}

		// 验证文件夹是否存在
		var validFolders []string
		for _, folder := range config.Folders {
			if _, err := os.Stat(folder); err == nil {
				validFolders = append(validFolders, folder)
			}
		}

		if len(validFolders) == 0 {
			return nil, errors.New("配置文件中的所有文件夹都不存在")
		}

		// 更新最近打开记录
		if err := a.db.AddRecentItem(a.ctx, "workspace", path, config.Name); err != nil {
			if a.logger != nil {
				a.logger.Warn("更新最近打开项目失败", zap.String("path", path), zap.Error(err))
			}
		}

		// 扫描第一个有效文件夹
		return a.scanFolder(validFolders[0])
	}

	// 文件夹类型，直接扫描
	result, err := a.scanFolder(path)
	if err != nil {
		return nil, err
	}

	// 更新最近打开记录
	absPath, _ := filepath.Abs(path)
	wsName := filepath.Base(absPath)
	if err := a.db.AddRecentItem(a.ctx, "folder", absPath, wsName); err != nil {
		if a.logger != nil {
			a.logger.Warn("更新最近打开项目失败", zap.String("path", path), zap.Error(err))
		}
	}

	return result, nil
}

// RemoveRecentItem 从最近列表中移除项目
func (a *App) RemoveRecentItem(path string) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}

	return a.db.RemoveRecentItem(a.ctx, path)
}

// ShowStartupDialog 显示启动选择对话框
func (a *App) ShowStartupDialog() (string, error) {
	if a.ctx == nil {
		return "", errors.New("应用尚未完成初始化")
	}

	// 使用消息对话框让用户选择
	selection, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "TagExplorer - 选择启动方式",
		Message:       "请选择您要如何开始：",
		Buttons:       []string{"打开工作区文件", "打开文件夹", "取消"},
		DefaultButton: "打开工作区文件",
	})
	if err != nil {
		return "", fmt.Errorf("显示启动对话框失败: %w", err)
	}

	switch selection {
	case "打开工作区文件":
		return "workspace", nil
	case "打开文件夹":
		return "folder", nil
	default:
		return "cancel", nil
	}
}

// ScanWorkspaceFolder 扫描指定路径的文件夹
func (a *App) ScanWorkspaceFolder(folderPath string) (*api.ScanResult, error) {
	if folderPath == "" {
		return nil, errors.New("文件夹路径不能为空")
	}
	return a.scanFolder(folderPath)
}

// scanFolder 内部方法：扫描文件夹（不记录到最近列表）
func (a *App) scanFolder(selectedPath string) (*api.ScanResult, error) {
	absPath, err := filepath.Abs(selectedPath)
	if err != nil {
		return nil, fmt.Errorf("解析工作区绝对路径失败: %w", err)
	}

	wsName := filepath.Base(absPath)
	ws, err := a.db.UpsertWorkspace(a.ctx, absPath, wsName)
	if err != nil {
		if a.logger != nil {
			a.logger.Error("创建/更新工作区失败", zap.String("path", absPath), zap.Error(err))
		}
		return nil, err
	}

	if a.logger != nil {
		a.logger.Info("开始扫描工作区", zap.Int64("workspace_id", ws.ID), zap.String("path", ws.Path))
	}

	result, err := a.scanner.Scan(a.ctx, ws)
	if err != nil {
		if a.logger != nil {
			a.logger.Error("扫描工作区失败", zap.Int64("workspace_id", ws.ID), zap.Error(err))
		}
		return nil, err
	}

	a.currentWorkspace = ws

	// 扫描完成后，处理文件名中的标签
	if err := a.processFileNameTags(a.ctx, ws.ID); err != nil {
		if a.logger != nil {
			a.logger.Warn("处理文件名标签失败", zap.Int64("workspace_id", ws.ID), zap.Error(err))
		}
	}

	if a.logger != nil {
		a.logger.Info(
			"扫描工作区完成",
			zap.Int64("workspace_id", ws.ID),
			zap.Int("file_count", result.FileCount),
			zap.Int("directory_count", result.DirectoryCount),
		)
	}

	return &api.ScanResult{
		Workspace:      toAPIWorkspace(&result.Workspace),
		FileCount:      result.FileCount,
		DirectoryCount: result.DirectoryCount,
	}, nil
}

// SelectWorkspace 让用户选择目录并触发扫描
func (a *App) SelectWorkspace() (*api.ScanResult, error) {
	if a.ctx == nil {
		return nil, errors.New("应用尚未完成初始化")
	}

	selectedPath, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择工作区目录",
	})
	if err != nil {
		return nil, fmt.Errorf("打开目录选择对话框失败: %w", err)
	}

	if selectedPath == "" {
		if a.logger != nil {
			a.logger.Info("用户取消选择工作区")
		}
		a.currentWorkspace = nil
		return nil, nil
	}

	result, err := a.scanFolder(selectedPath)
	if err != nil {
		return nil, err
	}

	// 用户直接选择文件夹时，记录到最近打开列表
	absPath, _ := filepath.Abs(selectedPath)
	wsName := filepath.Base(absPath)
	if err := a.db.AddRecentItem(a.ctx, "folder", absPath, wsName); err != nil {
		if a.logger != nil {
			a.logger.Warn("记录最近打开项目失败", zap.String("path", absPath), zap.Error(err))
		}
	}

	return result, nil
}

// GetFiles 分页返回当前工作区文件列表
func (a *App) GetFiles(limit, offset int) (*api.FilePage, error) {
	if a.ctx == nil {
		return nil, errors.New("应用尚未初始化")
	}
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}
	if a.currentWorkspace == nil {
		return nil, errors.New("尚未选择工作区")
	}

	page, err := a.db.ListFiles(a.ctx, a.currentWorkspace.ID, limit, offset)
	if err != nil {
		if a.logger != nil {
			a.logger.Error(
				"获取文件列表失败",
				zap.Int64("workspace_id", a.currentWorkspace.ID),
				zap.Int("limit", limit),
				zap.Int("offset", offset),
				zap.Error(err),
			)
		}
		return nil, err
	}

	return toAPIFilePage(page), nil
}

// ListTags 返回全部标签
func (a *App) ListTags() ([]api.Tag, error) {
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}
	tags, err := a.db.ListTags(a.ctx)
	if err != nil {
		if a.logger != nil {
			a.logger.Error("查询标签失败", zap.Error(err))
		}
		return nil, err
	}
	result := make([]api.Tag, 0, len(tags))
	for _, tag := range tags {
		result = append(result, toAPITag(tag))
	}
	return result, nil
}

// CreateTag 创建新标签
func (a *App) CreateTag(name, color string, parentID *int64) (*api.Tag, error) {
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}
	tag, err := a.db.CreateTag(a.ctx, name, color, parentID)
	if err != nil {
		if a.logger != nil {
			a.logger.Error("创建标签失败", zap.String("name", name), zap.Error(err))
		}
		return nil, err
	}
	apiTag := toAPITag(*tag)
	return &apiTag, nil
}

// DeleteTag 删除标签
func (a *App) DeleteTag(id int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if err := a.db.DeleteTag(a.ctx, id); err != nil {
		if a.logger != nil {
			a.logger.Error("删除标签失败", zap.Int64("tag_id", id), zap.Error(err))
		}
		return err
	}
	return nil
}

// AddTagToFile 为文件添加标签并重命名文件
func (a *App) AddTagToFile(fileID, tagID int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if err := a.db.AddTagToFile(a.ctx, fileID, tagID); err != nil {
		if a.logger != nil {
			a.logger.Error("文件打标签失败", zap.Int64("file_id", fileID), zap.Int64("tag_id", tagID), zap.Error(err))
		}
		return err
	}

	// 添加标签后重命名文件
	if err := a.RenameFileWithTags(fileID); err != nil {
		if a.logger != nil {
			a.logger.Warn("添加标签后重命名文件失败", zap.Int64("file_id", fileID), zap.Error(err))
		}
		// 重命名失败不影响标签添加的成功
	}

	return nil
}

// RemoveTagFromFile 移除文件标签并重命名文件
func (a *App) RemoveTagFromFile(fileID, tagID int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if err := a.db.RemoveTagFromFile(a.ctx, fileID, tagID); err != nil {
		if a.logger != nil {
			a.logger.Error("移除文件标签失败", zap.Int64("file_id", fileID), zap.Int64("tag_id", tagID), zap.Error(err))
		}
		return err
	}

	// 移除标签后重命名文件
	if err := a.RenameFileWithTags(fileID); err != nil {
		if a.logger != nil {
			a.logger.Warn("移除标签后重命名文件失败", zap.Int64("file_id", fileID), zap.Error(err))
		}
		// 重命名失败不影响标签移除的成功
	}

	return nil
}

// ClearAllTagsFromFile 清除文件的所有标签并重命名文件
func (a *App) ClearAllTagsFromFile(fileID int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if err := a.db.ClearAllTagsFromFile(a.ctx, fileID); err != nil {
		if a.logger != nil {
			a.logger.Error("清除文件所有标签失败", zap.Int64("file_id", fileID), zap.Error(err))
		}
		return err
	}

	// 清除标签后重命名文件（移除文件名中的标签部分）
	if err := a.RenameFileWithTags(fileID); err != nil {
		if a.logger != nil {
			a.logger.Warn("清除标签后重命名文件失败", zap.Int64("file_id", fileID), zap.Error(err))
		}
		// 重命名失败不影响标签清除的成功
	}

	if a.logger != nil {
		a.logger.Info("已清除文件所有标签", zap.Int64("file_id", fileID))
	}

	return nil
}

// parseTagsFromFileName 从文件名中解析标签，支持多种格式
func (a *App) parseTagsFromFileName(fileName string) []string {
	ext := filepath.Ext(fileName)
	nameWithoutExt := strings.TrimSuffix(fileName, ext)

	// 定义所有可能的格式
	formats := []struct {
		name      string
		prefix    string
		suffix    string
		separator string
	}{
		{"square_brackets", "[", "]", ", "},
		{"brackets", "<", ">", ", "},
		{"parentheses", "(", ")", ", "},
	}

	// 如果有自定义格式，也加入检测
	if a.settings.TagRule.Format == "custom" && a.settings.TagRule.CustomFormat != nil {
		formats = append(formats, struct {
			name      string
			prefix    string
			suffix    string
			separator string
		}{
			"custom",
			a.settings.TagRule.CustomFormat.Prefix,
			a.settings.TagRule.CustomFormat.Suffix,
			a.settings.TagRule.CustomFormat.Separator,
		})
	}

	// 尝试所有格式和位置组合
	for _, format := range formats {
		if format.prefix == "" || format.suffix == "" {
			continue
		}

		// 首先尝试识别分别显示的标签（如 [标签1][标签2]）
		if tags := a.parseIndividualTags(nameWithoutExt, format); len(tags) > 0 {
			if a.logger != nil {
				a.logger.Info("识别到分别显示的文件名标签",
					zap.String("file_name", fileName),
					zap.String("format", format.name),
					zap.Strings("tags", tags),
				)
			}
			return tags
		}

		// 然后尝试组合显示的标签（如 [标签1, 标签2]）
		// 尝试后缀位置 (默认)
		if strings.HasSuffix(nameWithoutExt, format.suffix) {
			if idx := strings.LastIndex(nameWithoutExt, format.prefix); idx != -1 {
				tagsPart := nameWithoutExt[idx+len(format.prefix) : len(nameWithoutExt)-len(format.suffix)]
				if tagsPart != "" {
					tags := a.splitTags(tagsPart, format.separator)
					if len(tags) > 0 {
						if a.logger != nil {
							a.logger.Info("识别到组合显示的文件名标签",
								zap.String("file_name", fileName),
								zap.String("format", format.name),
								zap.String("position", "suffix"),
								zap.Strings("tags", tags),
							)
						}
						return tags
					}
				}
			}
		}

		// 尝试前缀位置
		if strings.HasPrefix(nameWithoutExt, format.prefix) {
			if idx := strings.Index(nameWithoutExt, format.suffix); idx != -1 {
				tagsPart := nameWithoutExt[len(format.prefix):idx]
				if tagsPart != "" {
					tags := a.splitTags(tagsPart, format.separator)
					if len(tags) > 0 {
						if a.logger != nil {
							a.logger.Info("识别到组合显示的文件名标签",
								zap.String("file_name", fileName),
								zap.String("format", format.name),
								zap.String("position", "prefix"),
								zap.Strings("tags", tags),
							)
						}
						return tags
					}
				}
			}
		}
	}

	return nil
}

// parseIndividualTags 解析分别显示的标签（如 [标签1][标签2]）
func (a *App) parseIndividualTags(nameWithoutExt string, format struct {
	name      string
	prefix    string
	suffix    string
	separator string
}) []string {
	var tags []string
	remaining := nameWithoutExt

	// 根据当前设置的位置来解析
	if a.settings.TagRule.Position == "prefix" {
		// 从前面开始解析
		for strings.HasPrefix(remaining, format.prefix) {
			endIdx := strings.Index(remaining, format.suffix)
			if endIdx == -1 {
				break
			}

			tagName := remaining[len(format.prefix):endIdx]
			if tagName != "" {
				tags = append(tags, strings.TrimSpace(tagName))
			}

			remaining = remaining[endIdx+len(format.suffix):]
			// 跳过可能的空格
			remaining = strings.TrimLeft(remaining, " ")
		}
	} else {
		// 从后面开始解析
		for strings.HasSuffix(remaining, format.suffix) {
			startIdx := strings.LastIndex(remaining, format.prefix)
			if startIdx == -1 {
				break
			}

			tagName := remaining[startIdx+len(format.prefix) : len(remaining)-len(format.suffix)]
			if tagName != "" {
				// 因为是从后往前解析，所以要插入到前面
				tags = append([]string{strings.TrimSpace(tagName)}, tags...)
			}

			remaining = remaining[:startIdx]
			// 跳过可能的空格
			remaining = strings.TrimRight(remaining, " ")
		}
	}

	return tags
}

// splitTags 分割标签字符串
func (a *App) splitTags(tagsPart, separator string) []string {
	rawTags := strings.Split(tagsPart, separator)
	var tags []string
	for _, tag := range rawTags {
		cleaned := strings.TrimSpace(tag)
		if cleaned != "" {
			tags = append(tags, cleaned)
		}
	}
	return tags
}

// getCleanFileName 获取不带标签的文件名
func (a *App) getCleanFileName(fileName string) string {
	ext := filepath.Ext(fileName)
	nameWithoutExt := strings.TrimSuffix(fileName, ext)

	// 移除标签部分
	nameWithoutExt = a.removeTagsFromFileName(nameWithoutExt)

	return nameWithoutExt + ext
}

// generateFileNameWithTags 生成带标签的文件名
func (a *App) generateFileNameWithTags(originalName string, tags []data.Tag) string {
	// 分离文件名和扩展名
	ext := filepath.Ext(originalName)
	nameWithoutExt := strings.TrimSuffix(originalName, ext)

	if a.logger != nil {
		a.logger.Debug("开始生成带标签的文件名",
			zap.String("original_name", originalName),
			zap.Int("tag_count", len(tags)),
		)
	}

	// 完全移除现有的标签部分
	cleanName := a.removeTagsFromFileName(nameWithoutExt)

	if a.logger != nil {
		a.logger.Debug("清理后的文件名",
			zap.String("original", nameWithoutExt),
			zap.String("cleaned", cleanName),
		)
	}

	// 如果没有标签，返回不带标签的文件名
	if len(tags) == 0 {
		return cleanName + ext
	}

	// 根据设置生成标签字符串
	tagStr := a.formatTagsText(tags)
	if tagStr == "" {
		return cleanName + ext
	}

	// 根据设置应用标签到文件名
	space := ""
	if a.settings.TagRule.AddSpaces {
		space = " "
	}

	var result string
	if a.settings.TagRule.Position == "prefix" {
		result = tagStr + space + cleanName
	} else {
		result = cleanName + space + tagStr
	}

	finalName := result + ext

	if a.logger != nil {
		a.logger.Debug("生成的最终文件名",
			zap.String("final_name", finalName),
			zap.String("tag_str", tagStr),
		)
	}

	return finalName
}

// formatTagsText 根据设置格式化标签文本
func (a *App) formatTagsText(tags []data.Tag) string {
	if len(tags) == 0 {
		return ""
	}

	config := a.settings.TagRule

	// 获取格式设置
	var prefix, suffix, separator string

	switch config.Format {
	case "brackets":
		prefix, suffix, separator = "<", ">", ", "
	case "square_brackets":
		prefix, suffix, separator = "[", "]", ", "
	case "parentheses":
		prefix, suffix, separator = "(", ")", ", "
	case "custom":
		if config.CustomFormat != nil {
			prefix = a.sanitizeFileNamePart(config.CustomFormat.Prefix)
			suffix = a.sanitizeFileNamePart(config.CustomFormat.Suffix)
			separator = a.sanitizeFileNamePart(config.CustomFormat.Separator)
		} else {
			prefix, suffix, separator = "[", "]", ", "
		}
	default:
		prefix, suffix, separator = "[", "]", ", "
	}

	// 清理标签名称
	tagNames := make([]string, len(tags))
	for i, tag := range tags {
		tagNames[i] = a.sanitizeFileNamePart(tag.Name)
	}

	var result string

	// 根据组合方式构建标签字符串
	if config.Grouping == "individual" {
		// 分别显示：每个标签都有独立的括号
		var parts []string
		for _, tagName := range tagNames {
			part := prefix + tagName + suffix
			parts = append(parts, part)
		}
		result = strings.Join(parts, "")
	} else {
		// 组合显示：所有标签放在一个括号内
		tagStr := strings.Join(tagNames, separator)
		result = prefix + tagStr + suffix
	}

	// 最终清理整个标签字符串
	result = a.sanitizeFileNamePart(result)

	if a.logger != nil {
		a.logger.Debug("格式化标签文本",
			zap.String("format", config.Format),
			zap.String("grouping", config.Grouping),
			zap.String("result", result),
		)
	}

	return result
}

// sanitizeFileNamePart 清理文件名部分，移除或替换不允许的字符
func (a *App) sanitizeFileNamePart(input string) string {
	if input == "" {
		return input
	}

	// Windows 文件名不允许的字符
	invalidChars := []string{
		"<", ">", ":", "\"", "|", "?", "*",
		// 控制字符 (ASCII 0-31)
	}

	result := input

	// 替换不允许的字符
	for _, char := range invalidChars {
		switch char {
		case "|":
			result = strings.ReplaceAll(result, char, "丨") // 使用相似的Unicode字符
		case "<":
			result = strings.ReplaceAll(result, char, "＜") // 使用全角字符
		case ">":
			result = strings.ReplaceAll(result, char, "＞") // 使用全角字符
		case ":":
			result = strings.ReplaceAll(result, char, "：") // 使用全角字符
		case "\"":
			result = strings.ReplaceAll(result, char, "'") // 使用单引号
		case "?":
			result = strings.ReplaceAll(result, char, "？") // 使用全角字符
		case "*":
			result = strings.ReplaceAll(result, char, "＊") // 使用全角字符
		default:
			result = strings.ReplaceAll(result, char, "_")
		}
	}

	// 移除控制字符 (ASCII 0-31)
	var cleaned strings.Builder
	for _, r := range result {
		if r >= 32 || r == '\t' { // 保留制表符，移除其他控制字符
			cleaned.WriteRune(r)
		}
	}
	result = cleaned.String()

	// 移除开头和结尾的空格和点号（Windows 不允许）
	result = strings.Trim(result, " .")

	// 如果结果为空，返回默认值
	if result == "" {
		return "_"
	}

	return result
}

// removeTagsFromFileName 从文件名中移除标签部分，支持多种格式
func (a *App) removeTagsFromFileName(nameWithoutExt string) string {
	// 定义所有可能的格式
	formats := []struct {
		name   string
		prefix string
		suffix string
	}{
		{"square_brackets", "[", "]"},
		{"brackets", "<", ">"},
		{"parentheses", "(", ")"},
	}

	// 如果有自定义格式，也加入检测
	if a.settings.TagRule.Format == "custom" && a.settings.TagRule.CustomFormat != nil {
		formats = append(formats, struct {
			name   string
			prefix string
			suffix string
		}{
			"custom",
			a.settings.TagRule.CustomFormat.Prefix,
			a.settings.TagRule.CustomFormat.Suffix,
		})
	}

	result := nameWithoutExt
	originalResult := result

	// 循环移除所有标签，直到没有更多标签可移除
	maxIterations := 20 // 防止无限循环
	for iteration := 0; iteration < maxIterations; iteration++ {
		previousResult := result

		for _, format := range formats {
			if format.prefix == "" || format.suffix == "" {
				continue
			}

			// 移除所有后缀标签（包括分别显示的标签）
			result = a.removeAllSuffixTags(result, format.prefix, format.suffix)

			// 移除所有前缀标签（包括分别显示的标签）
			result = a.removeAllPrefixTags(result, format.prefix, format.suffix)
		}

		// 如果这一轮没有任何变化，说明已经清理完毕
		if result == previousResult {
			break
		}
	}

	// 最终清理多余的空格
	result = strings.TrimSpace(result)

	if result != originalResult && a.logger != nil {
		a.logger.Info("移除文件名标签",
			zap.String("original", originalResult),
			zap.String("cleaned", result),
		)
	}

	return result
}

// removeAllSuffixTags 移除所有后缀标签
func (a *App) removeAllSuffixTags(input, prefix, suffix string) string {
	result := input

	// 循环移除后缀标签，直到没有更多可移除的
	for {
		if !strings.HasSuffix(result, suffix) {
			break
		}

		// 找到最后一个匹配的前缀
		lastPrefixIdx := strings.LastIndex(result, prefix)
		if lastPrefixIdx == -1 {
			break
		}

		// 检查这个前缀和后缀是否匹配
		tagContent := result[lastPrefixIdx+len(prefix) : len(result)-len(suffix)]

		// 确保标签内容不包含未匹配的括号
		if a.isValidTagContent(tagContent, prefix, suffix) {
			// 移除这个标签
			result = result[:lastPrefixIdx]
			// 移除可能的空格
			result = strings.TrimRight(result, " ")
		} else {
			break
		}
	}

	return result
}

// removeAllPrefixTags 移除所有前缀标签
func (a *App) removeAllPrefixTags(input, prefix, suffix string) string {
	result := input

	// 循环移除前缀标签，直到没有更多可移除的
	for {
		if !strings.HasPrefix(result, prefix) {
			break
		}

		// 找到第一个匹配的后缀
		firstSuffixIdx := strings.Index(result, suffix)
		if firstSuffixIdx == -1 {
			break
		}

		// 检查这个前缀和后缀是否匹配
		tagContent := result[len(prefix):firstSuffixIdx]

		// 确保标签内容不包含未匹配的括号
		if a.isValidTagContent(tagContent, prefix, suffix) {
			// 移除这个标签
			result = result[firstSuffixIdx+len(suffix):]
			// 移除可能的空格
			result = strings.TrimLeft(result, " ")
		} else {
			break
		}
	}

	return result
}

// isValidTagContent 检查标签内容是否有效（不包含未匹配的括号）
func (a *App) isValidTagContent(content, prefix, suffix string) bool {
	// 简单检查：标签内容不应该包含相同的前缀或后缀字符
	// 这可以防止错误地匹配嵌套的括号
	return !strings.Contains(content, prefix) && !strings.Contains(content, suffix)
}

// RenameFileWithTags 根据标签重命名文件
func (a *App) RenameFileWithTags(fileID int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if a.currentWorkspace == nil {
		return errors.New("尚未选择工作区")
	}

	// 获取文件信息（包含标签）
	file, err := a.db.GetFileByID(a.ctx, fileID)
	if err != nil {
		return fmt.Errorf("获取文件信息失败: %w", err)
	}

	// 记录原始文件名用于日志
	originalName := file.Name

	// 生成新的文件名（会自动移除旧格式标签并应用新格式）
	newName := a.generateFileNameWithTags(file.Name, file.Tags)

	// 如果文件名没有变化，直接返回
	if newName == file.Name {
		if a.logger != nil {
			a.logger.Debug("文件名无需更改",
				zap.Int64("file_id", fileID),
				zap.String("file_name", file.Name),
			)
		}
		return nil
	}

	if a.logger != nil {
		a.logger.Info("应用新标签格式重命名文件",
			zap.Int64("file_id", fileID),
			zap.String("original_name", originalName),
			zap.String("new_name", newName),
			zap.String("tag_format", a.settings.TagRule.Format),
			zap.String("tag_position", a.settings.TagRule.Position),
		)
	}

	// 重命名文件
	return a.RenameFile(fileID, newName)
}

// RenameFile 重命名文件并更新数据库
func (a *App) RenameFile(fileID int64, newName string) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if a.currentWorkspace == nil {
		return errors.New("尚未选择工作区")
	}
	if newName == "" {
		return errors.New("新文件名不能为空")
	}

	// 获取文件信息
	file, err := a.db.GetFileByID(a.ctx, fileID)
	if err != nil {
		return fmt.Errorf("获取文件信息失败: %w", err)
	}

	// 构建完整路径
	oldPath := filepath.Join(a.currentWorkspace.Path, file.Path)
	newPath := filepath.Join(filepath.Dir(oldPath), newName)

	// 检查新文件名是否已存在
	if _, err := os.Stat(newPath); err == nil {
		return errors.New("目标文件名已存在")
	}

	// 重命名文件
	if err := os.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("重命名文件失败: %w", err)
	}

	// 更新数据库中的文件信息
	newRelPath, err := filepath.Rel(a.currentWorkspace.Path, newPath)
	if err != nil {
		// 如果更新数据库失败，尝试回滚文件重命名
		_ = os.Rename(newPath, oldPath)
		return fmt.Errorf("计算相对路径失败: %w", err)
	}

	if err := a.db.UpdateFileName(a.ctx, fileID, newName, newRelPath); err != nil {
		// 如果更新数据库失败，尝试回滚文件重命名
		_ = os.Rename(newPath, oldPath)
		return fmt.Errorf("更新数据库失败: %w", err)
	}

	if a.logger != nil {
		a.logger.Info("文件重命名成功",
			zap.Int64("file_id", fileID),
			zap.String("old_name", file.Name),
			zap.String("new_name", newName),
		)
	}

	return nil
}

// PreviewOrganize 生成整理预览
func (a *App) PreviewOrganize(req api.OrganizeRequest) (*api.OrganizePreview, error) {
	plan, err := a.buildOrganizePlan(req)
	if err != nil {
		return nil, err
	}
	return plan, nil
}

// ExecuteOrganize 执行整理并记录可撤销操作
func (a *App) ExecuteOrganize(req api.OrganizeRequest) (*api.OrganizeResult, error) {
	plan, err := a.buildOrganizePlan(req)
	if err != nil {
		return nil, err
	}

	if plan.Summary.ConflictCount > 0 {
		return nil, fmt.Errorf("存在 %d 个冲突，需先解决后再执行", plan.Summary.ConflictCount)
	}
	if plan.Summary.MoveCount == 0 {
		return &api.OrganizeResult{Preview: *plan}, nil
	}

	executed := make([]api.OrganizeMoveRecord, 0, plan.Summary.MoveCount)
	for _, item := range plan.Items {
		if item.Status != "move" {
			continue
		}
		record, moveErr := a.performOrganizeMove(item)
		if moveErr != nil {
			// 回滚已执行的移动，保持一致性
			for i := len(executed) - 1; i >= 0; i-- {
				_ = a.rollbackOrganizeMove(executed[i])
			}
			return nil, moveErr
		}
		executed = append(executed, record)
	}

	payload := api.OrganizeOperationPayload{
		WorkspaceID: a.currentWorkspace.ID,
		Moves:       executed,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("序列化整理记录失败: %w", err)
	}

	opID, err := a.db.InsertOperation(a.ctx, "organize", string(data))
	if err != nil {
		return nil, fmt.Errorf("写入整理记录失败: %w", err)
	}

	if a.logger != nil {
		a.logger.Info("一键整理完成",
			zap.Int("moved", len(executed)),
			zap.Int64("operation_id", opID),
		)
	}

	return &api.OrganizeResult{
		Preview:     *plan,
		OperationID: opID,
	}, nil
}

// UndoOrganize 撤销整理
func (a *App) UndoOrganize(operationID int64) (*api.OrganizeUndoResult, error) {
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}
	if a.currentWorkspace == nil {
		return nil, errors.New("尚未选择工作区")
	}
	if operationID <= 0 {
		return nil, errors.New("无效的操作 ID")
	}

	op, err := a.db.GetOperation(a.ctx, operationID)
	if err != nil {
		return nil, err
	}
	if op.Type != "organize" {
		return nil, errors.New("操作类型不匹配，无法撤销")
	}

	var payload api.OrganizeOperationPayload
	if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
		return nil, fmt.Errorf("解析整理记录失败: %w", err)
	}
	if payload.WorkspaceID != a.currentWorkspace.ID {
		return nil, errors.New("当前工作区与整理记录不一致，请先切换到原工作区")
	}

	result := &api.OrganizeUndoResult{}
	for i := len(payload.Moves) - 1; i >= 0; i-- {
		if err := a.rollbackOrganizeMove(payload.Moves[i]); err != nil {
			result.Failed++
			if a.logger != nil {
				a.logger.Warn("撤销整理失败",
					zap.Int64("file_id", payload.Moves[i].FileID),
					zap.Error(err),
				)
			}
		} else {
			result.Restored++
		}
	}

	// 撤销成功后删除记录，失败则保留便于重试
	if result.Failed == 0 {
		_ = a.db.DeleteOperation(a.ctx, operationID)
	}

	return result, nil
}

// buildOrganizePlan 根据请求生成整理计划（不触磁盘）
func (a *App) buildOrganizePlan(req api.OrganizeRequest) (*api.OrganizePreview, error) {
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}
	if a.currentWorkspace == nil {
		return nil, errors.New("尚未选择工作区")
	}
	if len(req.Levels) == 0 {
		return nil, errors.New("至少需要一个层级")
	}

	required := make(map[int64]struct{})
	for idx, level := range req.Levels {
		if len(level.TagIDs) == 0 {
			return nil, fmt.Errorf("第 %d 级至少选择一个标签", idx+1)
		}
		for _, tagID := range level.TagIDs {
			if tagID <= 0 {
				return nil, fmt.Errorf("第 %d 级存在无效的标签 ID", idx+1)
			}
			required[tagID] = struct{}{}
		}
	}

	// 准备标签名称映射
	tagNameMap := make(map[int64]string)
	tags, err := a.db.ListTags(a.ctx)
	if err != nil {
		return nil, fmt.Errorf("查询标签失败: %w", err)
	}
	for _, tag := range tags {
		tagNameMap[tag.ID] = tag.Name
	}
	for tagID := range required {
		if _, ok := tagNameMap[tagID]; !ok {
			return nil, fmt.Errorf("标签 ID %d 不存在或已删除", tagID)
		}
	}

	plan := &api.OrganizePreview{
		Items:    make([]api.OrganizePreviewItem, 0),
		Summary:  api.OrganizeSummary{},
		BasePath: a.currentWorkspace.Path,
	}
	targetUsed := make(map[string]int64)

	const batchSize = 500
	offset := 0
	for {
		page, err := a.db.ListFiles(a.ctx, a.currentWorkspace.ID, batchSize, offset)
		if err != nil {
			return nil, fmt.Errorf("获取文件列表失败: %w", err)
		}
		if len(page.Records) == 0 {
			break
		}

		for _, file := range page.Records {
			if file.Type != data.FileTypeRegular {
				continue
			}

			tagSet := make(map[int64]bool, len(file.Tags))
			tagNames := make([]string, 0, len(file.Tags))
			for _, tag := range file.Tags {
				tagSet[tag.ID] = true
				tagNames = append(tagNames, tag.Name)
			}

			// 跳过完全不相关的文件
			hasRelevant := false
			for tagID := range required {
				if tagSet[tagID] {
					hasRelevant = true
					break
				}
			}
			if !hasRelevant {
				continue
			}

			item := api.OrganizePreviewItem{
				FileID:       file.ID,
				OriginalPath: filepath.ToSlash(file.Path),
				Tags:         tagNames,
			}

			var missing []string
			for _, level := range req.Levels {
				for _, tagID := range level.TagIDs {
					if !tagSet[tagID] {
						missing = append(missing, tagNameMap[tagID])
					}
				}
			}
			if len(missing) > 0 {
				item.Status = "skip_missing_tags"
				item.MissingTags = missing
				plan.Summary.SkipCount++
				plan.Summary.Total++
				plan.Items = append(plan.Items, item)
				continue
			}

			var segments []string
			for _, level := range req.Levels {
				names := make([]string, 0, len(level.TagIDs))
				for _, tagID := range level.TagIDs {
					names = append(names, sanitizeFolderSegment(tagNameMap[tagID]))
				}
				segments = append(segments, fmt.Sprintf("[%s]", strings.Join(names, "][")))
			}

			folderPath := filepath.Join(segments...)
			targetRelPath := filepath.ToSlash(filepath.Join(folderPath, file.Name))
			item.TargetPath = targetRelPath

			if targetRelPath == item.OriginalPath {
				item.Status = "already_in_place"
				plan.Summary.AlreadyInPlace++
				plan.Summary.Total++
				plan.Items = append(plan.Items, item)
				continue
			}

			if owner, ok := targetUsed[targetRelPath]; ok && owner != file.ID {
				item.Status = "conflict"
				item.Message = "目标路径与其他文件冲突"
				plan.Summary.ConflictCount++
				plan.Summary.Total++
				plan.Items = append(plan.Items, item)
				continue
			}

			targetAbs := filepath.Join(a.currentWorkspace.Path, filepath.FromSlash(targetRelPath))
			if _, err := os.Stat(targetAbs); err == nil {
				item.Status = "conflict"
				item.Message = "目标位置已有同名文件"
				plan.Summary.ConflictCount++
				plan.Summary.Total++
				plan.Items = append(plan.Items, item)
				continue
			} else if err != nil && !errors.Is(err, os.ErrNotExist) {
				return nil, fmt.Errorf("检查目标路径失败: %w", err)
			}

			item.Status = "move"
			plan.Summary.MoveCount++
			plan.Summary.Total++
			plan.Items = append(plan.Items, item)
			targetUsed[targetRelPath] = file.ID
		}

		if len(page.Records) < batchSize {
			break
		}
		offset += len(page.Records)
	}

	return plan, nil
}

// performOrganizeMove 执行单个文件移动
func (a *App) performOrganizeMove(item api.OrganizePreviewItem) (api.OrganizeMoveRecord, error) {
	if a.currentWorkspace == nil {
		return api.OrganizeMoveRecord{}, errors.New("尚未选择工作区")
	}

	file, err := a.db.GetFileByID(a.ctx, item.FileID)
	if err != nil {
		return api.OrganizeMoveRecord{}, fmt.Errorf("获取文件信息失败: %w", err)
	}
	if filepath.ToSlash(file.Path) != item.OriginalPath {
		return api.OrganizeMoveRecord{}, fmt.Errorf("文件路径已变化，需重新生成预览: %s", file.Path)
	}

	srcAbs := filepath.Join(a.currentWorkspace.Path, filepath.FromSlash(item.OriginalPath))
	dstAbs := filepath.Join(a.currentWorkspace.Path, filepath.FromSlash(item.TargetPath))
	if err := os.MkdirAll(filepath.Dir(dstAbs), 0o755); err != nil {
		return api.OrganizeMoveRecord{}, fmt.Errorf("创建目标目录失败: %w", err)
	}

	if err := os.Rename(srcAbs, dstAbs); err != nil {
		return api.OrganizeMoveRecord{}, fmt.Errorf("移动文件失败: %w", err)
	}

	newName := filepath.Base(dstAbs)
	newRel := filepath.ToSlash(item.TargetPath)
	if err := a.db.UpdateFileName(a.ctx, file.ID, newName, newRel); err != nil {
		_ = os.Rename(dstAbs, srcAbs)
		return api.OrganizeMoveRecord{}, fmt.Errorf("更新数据库失败: %w", err)
	}

	return api.OrganizeMoveRecord{
		FileID: file.ID,
		From:   item.OriginalPath,
		To:     item.TargetPath,
	}, nil
}

// rollbackOrganizeMove 回滚单个文件移动
func (a *App) rollbackOrganizeMove(record api.OrganizeMoveRecord) error {
	if a.currentWorkspace == nil {
		return errors.New("尚未选择工作区")
	}

	srcAbs := filepath.Join(a.currentWorkspace.Path, filepath.FromSlash(record.To))
	dstAbs := filepath.Join(a.currentWorkspace.Path, filepath.FromSlash(record.From))
	if err := os.MkdirAll(filepath.Dir(dstAbs), 0o755); err != nil {
		return fmt.Errorf("创建回滚目录失败: %w", err)
	}
	if err := os.Rename(srcAbs, dstAbs); err != nil {
		return fmt.Errorf("回滚移动失败: %w", err)
	}

	newName := filepath.Base(dstAbs)
	return a.db.UpdateFileName(a.ctx, record.FileID, newName, filepath.ToSlash(record.From))
}

// sanitizeFolderSegment 清理标签名为安全的目录段
func sanitizeFolderSegment(name string) string {
	clean := strings.TrimSpace(name)
	replacer := strings.NewReplacer(
		"<", "_", ">", "_", ":", "_", "\"", "_", "/", "_", "\\", "_", "|", "_", "?", "_", "*", "_",
		"[", "", "]", "",
	)
	clean = replacer.Replace(clean)
	if clean == "" {
		clean = "未命名"
	}
	return clean
}

// GetThumbnail 根据文件路径生成缩略图
func (a *App) GetThumbnail(filePath string) (string, error) {
	if a.currentWorkspace == nil {
		return "", errors.New("尚未选择工作区")
	}
	if filePath == "" {
		return "", errors.New("文件路径不可为空")
	}

	root := filepath.Clean(a.currentWorkspace.Path)
	var absPath string
	if filepath.IsAbs(filePath) {
		absPath = filepath.Clean(filePath)
	} else {
		absPath = filepath.Clean(filepath.Join(root, filePath))
	}

	rel, err := filepath.Rel(root, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", errors.New("文件不属于当前工作区")
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	if info.IsDir() {
		return "", errors.New("文件夹不支持生成缩略图")
	}

	ext := strings.ToLower(filepath.Ext(absPath))
	if _, ok := imageExtensions[ext]; ok {
		return a.generateImageThumbnail(absPath)
	}
	if _, ok := videoExtensions[ext]; ok {
		return a.generateVideoThumbnail(absPath)
	}
	return "", errors.New("暂不支持的文件类型")
}

func toAPIWorkspace(ws *data.Workspace) api.Workspace {
	if ws == nil {
		return api.Workspace{}
	}
	return api.Workspace{
		ID:        ws.ID,
		Path:      ws.Path,
		Name:      ws.Name,
		CreatedAt: formatTime(ws.CreatedAt),
	}
}

func toAPIFilePage(page *data.FilePage) *api.FilePage {
	if page == nil {
		return &api.FilePage{}
	}
	records := make([]api.FileRecord, 0, len(page.Records))
	for _, record := range page.Records {
		records = append(records, api.FileRecord{
			ID:          record.ID,
			WorkspaceID: record.WorkspaceID,
			Path:        record.Path,
			Name:        record.Name,
			Size:        record.Size,
			Type:        record.Type,
			ModTime:     formatTime(record.ModTime),
			CreatedAt:   formatTime(record.CreatedAt),
			Hash:        record.Hash,
			Tags:        toAPITags(record.Tags),
		})
	}

	return &api.FilePage{
		Total:   page.Total,
		Records: records,
	}
}

func toAPITags(tags []data.Tag) []api.Tag {
	if len(tags) == 0 {
		return nil
	}
	result := make([]api.Tag, 0, len(tags))
	for _, tag := range tags {
		result = append(result, toAPITag(tag))
	}
	return result
}

func toAPITag(tag data.Tag) api.Tag {
	var parentID *int64
	if tag.ParentID.Valid {
		value := tag.ParentID.Int64
		parentID = &value
	}
	return api.Tag{
		ID:       tag.ID,
		Name:     tag.Name,
		Color:    tag.Color,
		ParentID: parentID,
	}
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}

const thumbnailSize = 640

var imageExtensions = map[string]struct{}{
	".jpg":  {},
	".jpeg": {},
	".png":  {},
	".gif":  {},
	".bmp":  {},
	".webp": {},
	".tiff": {},
}

var videoExtensions = map[string]struct{}{
	".mp4":  {},
	".mov":  {},
	".mkv":  {},
	".avi":  {},
	".webm": {},
	".flv":  {},
}

func (a *App) generateImageThumbnail(path string) (string, error) {
	img, err := imaging.Open(path, imaging.AutoOrientation(true))
	if err != nil {
		return "", fmt.Errorf("读取图片失败: %w", err)
	}

	thumb := imaging.Fit(img, thumbnailSize, thumbnailSize, imaging.Lanczos)
	var buf bytes.Buffer
	if err := imaging.Encode(&buf, thumb, imaging.PNG); err != nil {
		return "", fmt.Errorf("编码图片失败: %w", err)
	}

	return encodeDataURL("image/png", buf.Bytes()), nil
}

func (a *App) generateVideoThumbnail(path string) (string, error) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", errors.New("未在系统 PATH 中找到 ffmpeg，可安装后重试")
	}

	tempFile, err := os.CreateTemp("", "tagexplorer-thumb-*.png")
	if err != nil {
		return "", fmt.Errorf("创建临时文件失败: %w", err)
	}
	tempPath := tempFile.Name()
	_ = tempFile.Close()
	defer os.Remove(tempPath)

	cmd := exec.Command(
		ffmpegPath,
		"-y",
		"-loglevel", "error",
		"-i", path,
		"-frames:v", "1",
		"-vf", fmt.Sprintf("scale=%d:-1", thumbnailSize),
		tempPath,
	)

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("生成视频缩略图失败: %w", err)
	}

	data, err := os.ReadFile(tempPath)
	if err != nil {
		return "", fmt.Errorf("读取缩略图失败: %w", err)
	}

	return encodeDataURL("image/png", data), nil
}

func encodeDataURL(mime string, data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mime, encoded)
}

// processFileNameTags 处理工作区中所有文件名包含的标签
func (a *App) processFileNameTags(ctx context.Context, workspaceID int64) error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}

	// 获取工作区中的所有文件
	const batchSize = 1000
	offset := 0

	for {
		page, err := a.db.ListFiles(ctx, workspaceID, batchSize, offset)
		if err != nil {
			return fmt.Errorf("获取文件列表失败: %w", err)
		}

		if len(page.Records) == 0 {
			break
		}

		// 处理当前批次的文件
		for _, file := range page.Records {
			// 只处理普通文件，跳过目录
			if file.Type != data.FileTypeRegular {
				continue
			}

			// 解析文件名中的标签
			tags := a.parseTagsFromFileName(file.Name)
			if len(tags) == 0 {
				continue
			}

			// 批量添加标签到文件
			if err := a.db.BatchAddTagsToFile(ctx, file.ID, tags); err != nil {
				if a.logger != nil {
					a.logger.Warn("为文件添加标签失败",
						zap.Int64("file_id", file.ID),
						zap.String("file_name", file.Name),
						zap.Strings("tags", tags),
						zap.Error(err),
					)
				}
				// 继续处理其他文件，不因单个文件失败而中断
				continue
			}

			if a.logger != nil {
				a.logger.Info("从文件名识别并添加标签",
					zap.Int64("file_id", file.ID),
					zap.String("file_name", file.Name),
					zap.Strings("tags", tags),
				)
			}
		}

		// 如果返回的记录数少于批次大小，说明已经处理完所有文件
		if len(page.Records) < batchSize {
			break
		}

		offset += batchSize
	}

	if a.logger != nil {
		a.logger.Info("完成文件名标签处理", zap.Int64("workspace_id", workspaceID))
	}

	return nil
}

// SearchFilesByTags 根据标签搜索文件
func (a *App) SearchFilesByTags(params api.FileSearchParams) (*api.FilePage, error) {
	if a.ctx == nil {
		return nil, errors.New("应用尚未初始化")
	}
	if a.db == nil {
		return nil, errors.New("数据库尚未准备就绪")
	}
	if a.currentWorkspace == nil {
		return nil, errors.New("尚未选择工作区")
	}
	if len(params.TagIDs) == 0 {
		return nil, errors.New("至少需要选择一个标签")
	}

	if a.logger != nil {
		a.logger.Info("按标签搜索文件",
			zap.Int64("workspace_id", a.currentWorkspace.ID),
			zap.Int64s("tag_ids", params.TagIDs),
			zap.String("folder_path", params.FolderPath),
			zap.Bool("include_subfolders", params.IncludeSubfolders),
		)
	}

	page, err := a.db.ListFilesByTags(
		a.ctx,
		a.currentWorkspace.ID,
		params.TagIDs,
		params.FolderPath,
		params.IncludeSubfolders,
		params.Limit,
		params.Offset,
	)
	if err != nil {
		if a.logger != nil {
			a.logger.Error("按标签搜索文件失败",
				zap.Int64("workspace_id", a.currentWorkspace.ID),
				zap.Error(err),
			)
		}
		return nil, err
	}

	return toAPIFilePage(page), nil
}

// loadSettingsFromDB 从数据库加载设置
func (a *App) loadSettingsFromDB() error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}

	settingsJSON, err := a.db.GetSetting(a.ctx, "app_settings")
	if err != nil {
		return fmt.Errorf("获取设置失败: %w", err)
	}

	if settingsJSON == "" {
		// 没有保存的设置，使用默认值
		return nil
	}

	var settings api.AppSettings
	if err := json.Unmarshal([]byte(settingsJSON), &settings); err != nil {
		return fmt.Errorf("解析设置失败: %w", err)
	}

	a.settings = &settings

	if a.logger != nil {
		a.logger.Info("从数据库加载设置成功",
			zap.String("tag_format", settings.TagRule.Format),
			zap.String("tag_position", settings.TagRule.Position),
		)
	}

	return nil
}

// saveSettingsToDB 保存设置到数据库
func (a *App) saveSettingsToDB() error {
	if a.db == nil {
		return errors.New("数据库尚未准备就绪")
	}
	if a.settings == nil {
		return errors.New("设置尚未初始化")
	}

	settingsJSON, err := json.Marshal(a.settings)
	if err != nil {
		return fmt.Errorf("序列化设置失败: %w", err)
	}

	if err := a.db.SetSetting(a.ctx, "app_settings", string(settingsJSON)); err != nil {
		return fmt.Errorf("保存设置失败: %w", err)
	}

	if a.logger != nil {
		a.logger.Info("设置已保存到数据库")
	}

	return nil
}
