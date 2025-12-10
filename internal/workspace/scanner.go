package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
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

	const batchSize = 200
	batch := make([]data.FileMetadata, 0, batchSize)
	var files, dirs int

	walkErr := filepath.WalkDir(workspace.Path, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			s.logError("遍历目录失败", zap.String("path", path), zap.Error(walkErr), zap.Int64("workspace_id", workspace.ID))
			return walkErr
		}

		if ctxErr := ctx.Err(); ctxErr != nil {
			s.logError("扫描任务被取消", zap.Error(ctxErr), zap.Int64("workspace_id", workspace.ID))
			return ctxErr
		}

		info, err := d.Info()
		if err != nil {
			s.logError("获取文件信息失败", zap.String("path", path), zap.Error(err))
			return fmt.Errorf("获取文件信息失败(%s): %w", path, err)
		}

		relPath, err := filepath.Rel(workspace.Path, path)
		if err != nil {
			s.logError("计算相对路径失败", zap.String("path", path), zap.Error(err))
			return fmt.Errorf("计算相对路径失败(%s): %w", path, err)
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
			hash, err := s.hashFile(path)
			if err != nil {
				return err
			}
			item.Hash = hash
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

	return &ScanResult{
		Workspace:      *workspace,
		FileCount:      files,
		DirectoryCount: dirs,
	}, nil
}

// hashFile 生成文件的 SHA256 值
func (s *Scanner) hashFile(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		s.logError("打开文件失败", zap.String("path", path), zap.Error(err))
		return "", fmt.Errorf("打开文件失败(%s): %w", path, err)
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		s.logError("计算文件哈希失败", zap.String("path", path), zap.Error(err))
		return "", fmt.Errorf("计算哈希失败(%s): %w", path, err)
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func (s *Scanner) logError(msg string, fields ...zap.Field) {
	if s.logger == nil {
		return
	}
	s.logger.Error(msg, fields...)
}
