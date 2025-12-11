package workspace

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"

	"tagexplorer/internal/data"
)

// Scanner 负责递归扫描工作区
type Scanner struct {
	db     *data.Database
	logger *zap.Logger
}

// ScanResult 反馈扫描统计信息
type ScanResult struct {
	Workspace      data.Workspace `json:"workspace"`
	FileCount      int            `json:"file_count"`
	DirectoryCount int            `json:"directory_count"`
}

// NewScanner 创建扫描器
func NewScanner(db *data.Database, logger *zap.Logger) *Scanner {
	return &Scanner{
		db:     db,
		logger: logger,
	}
}

// 需要跳过的目录名（小写比较）
var skipDirs = map[string]bool{
	"node_modules":   true,
	".git":           true,
	".svn":           true,
	".hg":            true,
	"$recycle.bin":   true,
	"system volume information": true,
	".trash":         true,
	".ds_store":      true,
	"__pycache__":    true,
	".venv":          true,
	"venv":           true,
	".idea":          true,
	".vscode":        true,
	"vendor":         true,
	"dist":           true,
	"build":          true,
	".cache":         true,
	".npm":           true,
	".yarn":          true,
}

// shouldSkipDir 判断是否应该跳过该目录
func shouldSkipDir(name string) bool {
	lower := strings.ToLower(name)
	// 跳过隐藏目录（以 $ 开头的 Windows 系统目录）
	if strings.HasPrefix(name, "$") {
		return true
	}
	return skipDirs[lower]
}

// Scan 递归扫描目录并写入数据库
func (s *Scanner) Scan(ctx context.Context, workspace *data.Workspace) (*ScanResult, error) {
	if workspace == nil {
		s.logError("扫描时缺少工作区信息")
		return nil, errors.New("未提供工作区信息")
	}

	session, err := s.db.NewFileImportSession(ctx, workspace.ID)
	if err != nil {
		s.logError("创建文件导入事务失败", zap.Error(err), zap.Int64("workspace_id", workspace.ID))
		return nil, err
	}
	defer session.Close()

	const batchSize = 500 // 增大批次大小
	batch := make([]data.FileMetadata, 0, batchSize)
	var files, dirs int
	var skippedDirs int

	walkErr := filepath.WalkDir(workspace.Path, func(path string, d fs.DirEntry, walkErr error) error {
		// 权限错误等不应该中断整个扫描
		if walkErr != nil {
			s.logWarn("遍历目录时遇到错误，跳过", zap.String("path", path), zap.Error(walkErr))
			return nil // 返回 nil 继续扫描
		}

		// 检查上下文是否被取消
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// 跳过特定目录
		if d.IsDir() && shouldSkipDir(d.Name()) {
			skippedDirs++
			if s.logger != nil {
				s.logger.Debug("跳过目录", zap.String("path", path))
			}
			return filepath.SkipDir
		}

		// 使用 DirEntry 的信息，避免额外的 stat 调用
		info, err := d.Info()
		if err != nil {
			s.logWarn("获取文件信息失败，跳过", zap.String("path", path), zap.Error(err))
			return nil // 跳过这个文件，继续扫描
		}

		relPath, err := filepath.Rel(workspace.Path, path)
		if err != nil {
			s.logWarn("计算相对路径失败，跳过", zap.String("path", path), zap.Error(err))
			return nil
		}
		relPath = filepath.ToSlash(relPath)
		if relPath == "." {
			relPath = ""
		}

		item := data.FileMetadata{
			WorkspaceID: workspace.ID,
			Path:        relPath,
			Name:        info.Name(),
			Size:        info.Size(),
			Type:        data.FileTypeRegular,
			ModTime:     info.ModTime().UTC(),
			CreatedAt:   time.Now().UTC(),
		}

		if d.IsDir() {
			item.Type = data.FileTypeDirectory
			item.Size = 0
			dirs++
		} else {
			// 不再计算哈希，使用 路径+大小+修改时间 作为文件标识
			// 这是大多数文件管理器的做法，性能提升巨大
			item.Hash = fmt.Sprintf("%s_%d_%d", relPath, info.Size(), info.ModTime().UnixNano())
			files++
		}

		batch = append(batch, item)
		if len(batch) >= batchSize {
			if err := session.Insert(batch); err != nil {
				s.logError("批量写入文件记录失败", zap.Error(err), zap.Int64("workspace_id", workspace.ID))
				return err
			}
			batch = batch[:0]
		}
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}

	if len(batch) > 0 {
		if err := session.Insert(batch); err != nil {
			s.logError("批量写入文件记录失败", zap.Error(err), zap.Int64("workspace_id", workspace.ID))
			return nil, err
		}
	}

	if err := session.Commit(); err != nil {
		s.logError("提交文件导入事务失败", zap.Error(err), zap.Int64("workspace_id", workspace.ID))
		return nil, err
	}

	if s.logger != nil && skippedDirs > 0 {
		s.logger.Info("扫描完成，跳过了部分目录", zap.Int("skipped_dirs", skippedDirs))
	}

	return &ScanResult{
		Workspace:      *workspace,
		FileCount:      files,
		DirectoryCount: dirs,
	}, nil
}

func (s *Scanner) logError(msg string, fields ...zap.Field) {
	if s.logger == nil {
		return
	}
	s.logger.Error(msg, fields...)
}

func (s *Scanner) logWarn(msg string, fields ...zap.Field) {
	if s.logger == nil {
		return
	}
	s.logger.Warn(msg, fields...)
}
