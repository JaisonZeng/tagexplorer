package main

import (
	"bytes"
	"context"
	"encoding/base64"
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

// AddTagToFile 为文件添加标签
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
	return nil
}

// RemoveTagFromFile 移除文件标签
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
