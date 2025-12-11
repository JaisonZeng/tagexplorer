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

	if a.logger != nil {
		a.logger.Info("加载工作区配置成功", 
			zap.String("name", config.Name),
			zap.String("path", selectedPath),
			zap.Strings("folders", config.Folders),
		)
	}

	return &config, nil
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

// scanFolder 内部方法：扫描文件夹
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

	return a.scanFolder(selectedPath)
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

// parseTagsFromFileName 从文件名中解析标签
func parseTagsFromFileName(fileName string) []string {
	// 查找标签部分 [标签1, 标签2]
	if idx := strings.LastIndex(fileName, " ["); idx != -1 {
		ext := filepath.Ext(fileName)
		nameWithoutExt := strings.TrimSuffix(fileName, ext)
		
		if endIdx := strings.LastIndex(nameWithoutExt, "]"); endIdx != -1 && endIdx > idx {
			tagsPart := nameWithoutExt[idx+2 : endIdx] // 跳过 " ["
			if tagsPart != "" {
				// 分割标签并清理空白
				rawTags := strings.Split(tagsPart, ",")
				var tags []string
				for _, tag := range rawTags {
					cleaned := strings.TrimSpace(tag)
					if cleaned != "" {
						tags = append(tags, cleaned)
					}
				}
				return tags
			}
		}
	}
	return nil
}

// getCleanFileName 获取不带标签的文件名
func getCleanFileName(fileName string) string {
	ext := filepath.Ext(fileName)
	nameWithoutExt := strings.TrimSuffix(fileName, ext)
	
	// 移除标签部分
	if idx := strings.LastIndex(nameWithoutExt, " ["); idx != -1 {
		nameWithoutExt = nameWithoutExt[:idx]
	}
	
	return nameWithoutExt + ext
}

// generateFileNameWithTags 生成带标签的文件名
func generateFileNameWithTags(originalName string, tags []data.Tag) string {
	// 分离文件名和扩展名
	ext := filepath.Ext(originalName)
	nameWithoutExt := strings.TrimSuffix(originalName, ext)
	
	// 移除现有的标签部分（如果存在）
	if idx := strings.LastIndex(nameWithoutExt, " ["); idx != -1 {
		nameWithoutExt = nameWithoutExt[:idx]
	}
	
	// 如果没有标签，返回不带标签的文件名
	if len(tags) == 0 {
		return nameWithoutExt + ext
	}
	
	// 构建标签字符串
	tagNames := make([]string, len(tags))
	for i, tag := range tags {
		tagNames[i] = tag.Name
	}
	tagStr := strings.Join(tagNames, ", ")
	
	// 返回带标签的文件名
	return fmt.Sprintf("%s [%s]%s", nameWithoutExt, tagStr, ext)
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

	// 生成新的文件名
	newName := generateFileNameWithTags(file.Name, file.Tags)
	
	// 如果文件名没有变化，直接返回
	if newName == file.Name {
		return nil
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
			tags := parseTagsFromFileName(file.Name)
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
