package data

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// 文件类型常量
const (
	FileTypeRegular   = "file"
	FileTypeDirectory = "dir"
)

// Database 封装 sqlite 访问
type Database struct {
	conn *sql.DB
	path string
}

// Workspace 对应 workspaces 表
type Workspace struct {
	ID        int64     `json:"id"`
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// FileMetadata 用于批量写入 files 表
type FileMetadata struct {
	WorkspaceID int64
	Path        string
	Name        string
	Size        int64
	Type        string
	ModTime     time.Time
	CreatedAt   time.Time
	Hash        string
}

// Tag 表示标签记录
type Tag struct {
	ID       int64
	Name     string
	Color    string
	ParentID sql.NullInt64
}

// FileRecord 表示 files 表中的一条记录
type FileRecord struct {
	ID          int64     `json:"id"`
	WorkspaceID int64     `json:"workspace_id"`
	Path        string    `json:"path"`
	Name        string    `json:"name"`
	Size        int64     `json:"size"`
	Type        string    `json:"type"`
	ModTime     time.Time `json:"mod_time"`
	CreatedAt   time.Time `json:"created_at"`
	Hash        string    `json:"hash"`
	Tags        []Tag     `json:"tags"`
}

// FilePage 代表分页结果
type FilePage struct {
	Total   int64        `json:"total"`
	Records []FileRecord `json:"records"`
}

// FileImportSession 管理一次文件批量导入
type FileImportSession struct {
	ctx         context.Context
	tx          *sql.Tx
	stmt        *sql.Stmt
	workspaceID int64
	committed   bool
}

// NewDatabase 创建数据库连接，附带必要的 PRAGMA
func NewDatabase(dbPath string) (*Database, error) {
	if dbPath == "" {
		return nil, errors.New("数据库路径不可为空")
	}

	source := fmt.Sprintf(
		"file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)",
		filepath.ToSlash(dbPath),
	)

	conn, err := sql.Open("sqlite", source)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)

	return &Database{
		conn: conn,
		path: dbPath,
	}, nil
}

// InitDB 创建初始表结构和索引
func (d *Database) InitDB(ctx context.Context) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}

	statements := []string{
		`CREATE TABLE IF NOT EXISTS workspaces (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			path TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			workspace_id INTEGER NOT NULL,
			path TEXT NOT NULL,
			name TEXT NOT NULL,
			size INTEGER NOT NULL DEFAULT 0,
			type TEXT NOT NULL CHECK(type IN ('file', 'dir')),
			mod_time DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			hash TEXT,
			FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_files_workspace_path ON files(workspace_id, path);`,
		`CREATE INDEX IF NOT EXISTS idx_files_workspace_modtime ON files(workspace_id, mod_time);`,
		`CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			color TEXT,
			parent_id INTEGER,
			FOREIGN KEY(parent_id) REFERENCES tags(id) ON DELETE SET NULL
		);`,
		`CREATE TABLE IF NOT EXISTS file_tags (
			file_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			PRIMARY KEY(file_id, tag_id),
			FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
			FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS operations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL CHECK(type IN ('organize','tag')),
			payload TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);`,
		`CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);`,
	}

	for _, stmt := range statements {
		if _, err := d.conn.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("初始化数据库结构失败: %w", err)
		}
	}

	return nil
}

// Close 关闭数据库连接
func (d *Database) Close() error {
	if d == nil || d.conn == nil {
		return nil
	}
	return d.conn.Close()
}

// UpsertWorkspace 新增或更新工作区
func (d *Database) UpsertWorkspace(ctx context.Context, path, name string) (*Workspace, error) {
	if path == "" {
		return nil, errors.New("工作区路径不可为空")
	}
	if name == "" {
		return nil, errors.New("工作区名称不可为空")
	}

	tx, err := d.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	now := time.Now().UTC()
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO workspaces(path, name, created_at)
		 VALUES(?, ?, ?)
		 ON CONFLICT(path) DO UPDATE SET name=excluded.name;`,
		path, name, now,
	)
	if err != nil {
		return nil, fmt.Errorf("写入工作区失败: %w", err)
	}

	row := tx.QueryRowContext(ctx, `SELECT id, path, name, created_at FROM workspaces WHERE path = ?`, path)
	var ws Workspace
	if err = row.Scan(&ws.ID, &ws.Path, &ws.Name, &ws.CreatedAt); err != nil {
		return nil, fmt.Errorf("读取工作区失败: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("提交工作区事务失败: %w", err)
	}

	return &ws, nil
}

// CreateTag 新增标签
func (d *Database) CreateTag(ctx context.Context, name, color string, parentID *int64) (*Tag, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}

	name = strings.TrimSpace(name)
	color = strings.TrimSpace(color)

	if name == "" {
		return nil, errors.New("标签名称不可为空")
	}
	if color == "" {
		color = "#94a3b8"
	}

	var parent interface{}
	if parentID != nil {
		parent = *parentID
	} else {
		parent = nil
	}

	tx, err := d.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("开启标签事务失败: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	result, err := tx.ExecContext(
		ctx,
		`INSERT INTO tags(name, color, parent_id) VALUES(?, ?, ?)`,
		name,
		color,
		parent,
	)
	if err != nil {
		return nil, fmt.Errorf("创建标签失败: %w", err)
	}

	tagID, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("获取标签 ID 失败: %w", err)
	}

	var parentValue sql.NullInt64
	tag := Tag{}
	row := tx.QueryRowContext(
		ctx,
		`SELECT id, name, color, parent_id FROM tags WHERE id = ?`,
		tagID,
	)
	if err := row.Scan(&tag.ID, &tag.Name, &tag.Color, &parentValue); err != nil {
		return nil, fmt.Errorf("读取标签失败: %w", err)
	}
	tag.ParentID = parentValue

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("提交标签事务失败: %w", err)
	}

	return &tag, nil
}

// DeleteTag 删除标签
func (d *Database) DeleteTag(ctx context.Context, id int64) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}
	if id <= 0 {
		return errors.New("无效的标签 ID")
	}

	result, err := d.conn.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除标签失败: %w", err)
	}

	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return errors.New("标签不存在")
	}
	return nil
}

// ListTags 返回全部标签
func (d *Database) ListTags(ctx context.Context) ([]Tag, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}

	rows, err := d.conn.QueryContext(ctx, `SELECT id, name, color, parent_id FROM tags ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("查询标签失败: %w", err)
	}
	defer rows.Close()

	var tags []Tag
	for rows.Next() {
		var tag Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.Color, &tag.ParentID); err != nil {
			return nil, fmt.Errorf("读取标签记录失败: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历标签记录失败: %w", err)
	}

	return tags, nil
}

// AddTagToFile 将标签与文件关联
func (d *Database) AddTagToFile(ctx context.Context, fileID, tagID int64) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}
	if fileID <= 0 || tagID <= 0 {
		return errors.New("无效的文件或标签 ID")
	}

	_, err := d.conn.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO file_tags(file_id, tag_id) VALUES(?, ?)`,
		fileID,
		tagID,
	)
	if err != nil {
		return fmt.Errorf("添加标签到文件失败: %w", err)
	}
	return nil
}

// RemoveTagFromFile 解除文件与标签关联
func (d *Database) RemoveTagFromFile(ctx context.Context, fileID, tagID int64) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}
	if fileID <= 0 || tagID <= 0 {
		return errors.New("无效的文件或标签 ID")
	}

	_, err := d.conn.ExecContext(
		ctx,
		`DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?`,
		fileID,
		tagID,
	)
	if err != nil {
		return fmt.Errorf("从文件移除标签失败: %w", err)
	}
	return nil
}

// ListFiles 根据工作区分页查询文件
func (d *Database) ListFiles(ctx context.Context, workspaceID int64, limit, offset int) (*FilePage, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}
	if workspaceID <= 0 {
		return nil, errors.New("缺少有效的工作区 ID")
	}
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}
	if offset < 0 {
		offset = 0
	}

	var total int64
	if err := d.conn.QueryRowContext(
		ctx,
		`SELECT COUNT(1) FROM files WHERE workspace_id = ?`,
		workspaceID,
	).Scan(&total); err != nil {
		return nil, fmt.Errorf("统计文件数量失败: %w", err)
	}

	rows, err := d.conn.QueryContext(
		ctx,
		`SELECT id, workspace_id, path, name, size, type, mod_time, created_at, hash
		 FROM files
		 WHERE workspace_id = ?
		 ORDER BY id
		 LIMIT ? OFFSET ?`,
		workspaceID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("查询文件列表失败: %w", err)
	}
	defer rows.Close()

	records := make([]FileRecord, 0, limit)
	fileIDs := make([]int64, 0, limit)
	for rows.Next() {
		var record FileRecord
		if err := rows.Scan(
			&record.ID,
			&record.WorkspaceID,
			&record.Path,
			&record.Name,
			&record.Size,
			&record.Type,
			&record.ModTime,
			&record.CreatedAt,
			&record.Hash,
		); err != nil {
			return nil, fmt.Errorf("解析文件记录失败: %w", err)
		}
		records = append(records, record)
		fileIDs = append(fileIDs, record.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历文件记录失败: %w", err)
	}

	if len(fileIDs) > 0 {
		tagMap, err := d.getTagsForFiles(ctx, fileIDs)
		if err != nil {
			return nil, err
		}
		for i := range records {
			if tags, ok := tagMap[records[i].ID]; ok {
				records[i].Tags = tags
			}
		}
	}

	return &FilePage{
		Total:   total,
		Records: records,
	}, nil
}

func (d *Database) getTagsForFiles(ctx context.Context, fileIDs []int64) (map[int64][]Tag, error) {
	result := make(map[int64][]Tag, len(fileIDs))
	if len(fileIDs) == 0 {
		return result, nil
	}

	placeholders := make([]string, len(fileIDs))
	args := make([]any, len(fileIDs))
	for i, id := range fileIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT ft.file_id, t.id, t.name, t.color, t.parent_id
		 FROM file_tags ft
		 JOIN tags t ON ft.tag_id = t.id
		 WHERE ft.file_id IN (%s)
		 ORDER BY t.name COLLATE NOCASE`,
		strings.Join(placeholders, ","),
	)

	rows, err := d.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询文件标签失败: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var fileID int64
		var tag Tag
		if err := rows.Scan(&fileID, &tag.ID, &tag.Name, &tag.Color, &tag.ParentID); err != nil {
			return nil, fmt.Errorf("解析文件标签失败: %w", err)
		}
		result[fileID] = append(result[fileID], tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历文件标签失败: %w", err)
	}

	return result, nil
}

// NewFileImportSession 清空指定工作区旧记录并返回批量导入会话
func (d *Database) NewFileImportSession(ctx context.Context, workspaceID int64) (*FileImportSession, error) {
	tx, err := d.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("开启文件导入事务失败: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM files WHERE workspace_id = ?`, workspaceID); err != nil {
		_ = tx.Rollback()
		return nil, fmt.Errorf("清理旧文件记录失败: %w", err)
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO files(
			workspace_id, path, name, size, type, mod_time, created_at, hash
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
	`)
	if err != nil {
		_ = tx.Rollback()
		return nil, fmt.Errorf("准备插入语句失败: %w", err)
	}

	return &FileImportSession{
		ctx:         ctx,
		tx:          tx,
		stmt:        stmt,
		workspaceID: workspaceID,
	}, nil
}

// Insert 批量写入文件元数据
func (s *FileImportSession) Insert(batch []FileMetadata) error {
	if s == nil || s.stmt == nil {
		return errors.New("文件导入会话未初始化")
	}

	for _, item := range batch {
		if _, err := s.stmt.ExecContext(
			s.ctx,
			item.WorkspaceID,
			item.Path,
			item.Name,
			item.Size,
			item.Type,
			item.ModTime,
			item.CreatedAt,
			item.Hash,
		); err != nil {
			return fmt.Errorf("写入文件记录失败: %w", err)
		}
	}

	return nil
}

// Commit 完成批量导入
func (s *FileImportSession) Commit() error {
	if s == nil {
		return nil
	}

	if s.stmt != nil {
		_ = s.stmt.Close()
		s.stmt = nil
	}

	if err := s.tx.Commit(); err != nil {
		return fmt.Errorf("提交文件导入事务失败: %w", err)
	}

	s.committed = true
	return nil
}

// Close 释放事务资源（如未提交则回滚）
func (s *FileImportSession) Close() error {
	if s == nil {
		return nil
	}

	if s.stmt != nil {
		_ = s.stmt.Close()
		s.stmt = nil
	}

	if !s.committed && s.tx != nil {
		if err := s.tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
			return err
		}
	}

	s.tx = nil
	return nil
}

// GetFileByID 根据ID获取文件信息
func (d *Database) GetFileByID(ctx context.Context, fileID int64) (*FileRecord, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}
	if fileID <= 0 {
		return nil, errors.New("无效的文件 ID")
	}

	row := d.conn.QueryRowContext(
		ctx,
		`SELECT id, workspace_id, path, name, size, type, mod_time, created_at, hash
		 FROM files WHERE id = ?`,
		fileID,
	)

	var record FileRecord
	if err := row.Scan(
		&record.ID,
		&record.WorkspaceID,
		&record.Path,
		&record.Name,
		&record.Size,
		&record.Type,
		&record.ModTime,
		&record.CreatedAt,
		&record.Hash,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("文件不存在")
		}
		return nil, fmt.Errorf("查询文件失败: %w", err)
	}

	// 获取文件的标签
	tagMap, err := d.getTagsForFiles(ctx, []int64{fileID})
	if err != nil {
		return nil, err
	}
	if tags, ok := tagMap[fileID]; ok {
		record.Tags = tags
	}

	return &record, nil
}

// UpdateFileName 更新文件名和路径
func (d *Database) UpdateFileName(ctx context.Context, fileID int64, newName, newPath string) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}
	if fileID <= 0 {
		return errors.New("无效的文件 ID")
	}
	if newName == "" {
		return errors.New("新文件名不能为空")
	}
	if newPath == "" {
		return errors.New("新路径不能为空")
	}

	result, err := d.conn.ExecContext(
		ctx,
		`UPDATE files SET name = ?, path = ? WHERE id = ?`,
		newName, newPath, fileID,
	)
	if err != nil {
		return fmt.Errorf("更新文件名失败: %w", err)
	}

	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return errors.New("文件不存在")
	}

	return nil
}

// GetOrCreateTagByName 根据名称获取或创建标签
func (d *Database) GetOrCreateTagByName(ctx context.Context, name, defaultColor string) (*Tag, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}
	
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("标签名称不可为空")
	}
	if defaultColor == "" {
		defaultColor = "#94a3b8"
	}

	// 先尝试查找现有标签
	row := d.conn.QueryRowContext(ctx, `SELECT id, name, color, parent_id FROM tags WHERE name = ? COLLATE NOCASE`, name)
	var tag Tag
	err := row.Scan(&tag.ID, &tag.Name, &tag.Color, &tag.ParentID)
	if err == nil {
		return &tag, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("查询标签失败: %w", err)
	}

	// 标签不存在，创建新标签
	return d.CreateTag(ctx, name, defaultColor, nil)
}

// UpdateTagColor 更新标签颜色
func (d *Database) UpdateTagColor(ctx context.Context, id int64, color string) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}
	if id <= 0 {
		return errors.New("无效的标签 ID")
	}
	color = strings.TrimSpace(color)
	if color == "" {
		color = "#94a3b8"
	}

	result, err := d.conn.ExecContext(ctx, `UPDATE tags SET color = ? WHERE id = ?`, color, id)
	if err != nil {
		return fmt.Errorf("更新标签颜色失败: %w", err)
	}

	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return errors.New("标签不存在")
	}
	return nil
}

// ListWorkspaces 返回所有工作区
func (d *Database) ListWorkspaces(ctx context.Context) ([]Workspace, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}

	rows, err := d.conn.QueryContext(ctx, `SELECT id, path, name, created_at FROM workspaces ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("查询工作区失败: %w", err)
	}
	defer rows.Close()

	var workspaces []Workspace
	for rows.Next() {
		var ws Workspace
		if err := rows.Scan(&ws.ID, &ws.Path, &ws.Name, &ws.CreatedAt); err != nil {
			return nil, fmt.Errorf("读取工作区记录失败: %w", err)
		}
		workspaces = append(workspaces, ws)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历工作区记录失败: %w", err)
	}

	return workspaces, nil
}

// GetWorkspaceByID 根据ID获取工作区信息
func (d *Database) GetWorkspaceByID(ctx context.Context, workspaceID int64) (*Workspace, error) {
	if d == nil || d.conn == nil {
		return nil, errors.New("数据库对象尚未初始化")
	}
	if workspaceID <= 0 {
		return nil, errors.New("无效的工作区 ID")
	}

	row := d.conn.QueryRowContext(ctx, `SELECT id, path, name, created_at FROM workspaces WHERE id = ?`, workspaceID)
	var ws Workspace
	if err := row.Scan(&ws.ID, &ws.Path, &ws.Name, &ws.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("工作区不存在")
		}
		return nil, fmt.Errorf("查询工作区失败: %w", err)
	}

	return &ws, nil
}

// BatchAddTagsToFile 批量为文件添加标签（根据标签名称）
func (d *Database) BatchAddTagsToFile(ctx context.Context, fileID int64, tagNames []string) error {
	if d == nil || d.conn == nil {
		return errors.New("数据库对象尚未初始化")
	}
	if fileID <= 0 {
		return errors.New("无效的文件 ID")
	}
	if len(tagNames) == 0 {
		return nil
	}

	tx, err := d.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	for _, tagName := range tagNames {
		tagName = strings.TrimSpace(tagName)
		if tagName == "" {
			continue
		}

		// 获取或创建标签
		var tagID int64
		row := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE name = ? COLLATE NOCASE`, tagName)
		err = row.Scan(&tagID)
		if errors.Is(err, sql.ErrNoRows) {
			// 标签不存在，创建新标签
			result, createErr := tx.ExecContext(ctx, `INSERT INTO tags(name, color) VALUES(?, ?)`, tagName, "#94a3b8")
			if createErr != nil {
				return fmt.Errorf("创建标签失败: %w", createErr)
			}
			tagID, createErr = result.LastInsertId()
			if createErr != nil {
				return fmt.Errorf("获取新标签 ID 失败: %w", createErr)
			}
		} else if err != nil {
			return fmt.Errorf("查询标签失败: %w", err)
		}

		// 关联标签到文件
		_, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO file_tags(file_id, tag_id) VALUES(?, ?)`, fileID, tagID)
		if err != nil {
			return fmt.Errorf("关联标签到文件失败: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}

	return nil
}
