import {useEffect, useMemo, useState} from "react";
import {useShallow} from "zustand/react/shallow";
import {Eye, Plus, Trash2, Undo2, X, AlertTriangle, Sparkles} from "lucide-react";
import {PreviewOrganize, ExecuteOrganize, UndoOrganize} from "../../wailsjs/go/main/App";
import {useTagStore} from "../store/tags";
import {useWorkspaceStore} from "../store/workspace";
import type {
  OrganizeLevelPayload,
  OrganizePreview,
  OrganizePreviewItem,
  OrganizeRequestPayload,
  OrganizeResult,
} from "../types/organize";

interface OrganizeDialogProps {
  open: boolean;
  onClose: () => void;
}

const MAX_PREVIEW_ROWS = 200;

const statusBadge = (status: OrganizePreviewItem["status"]) => {
  switch (status) {
    case "move":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200";
    case "conflict":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200";
    case "skip_missing_tags":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200";
    case "already_in_place":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
};

const OrganizeDialog = ({open, onClose}: OrganizeDialogProps) => {
  const {tags, fetchTags, initialized} = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      fetchTags: state.fetchTags,
      initialized: state.initialized,
    }))
  );
  const {workspace, folders, fetchNextPage} = useWorkspaceStore(
    useShallow((state) => ({
      workspace: state.workspace,
      folders: state.folders,
      fetchNextPage: state.fetchNextPage,
    }))
  );

  const [levels, setLevels] = useState<OrganizeLevelPayload[]>([{tag_ids: []}]);
  const [preview, setPreview] = useState<OrganizePreview | null>(null);
  const [lastOperationId, setLastOperationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string>();

  const hasWorkspace = useMemo(() => folders.length > 0 || !!workspace, [folders.length, workspace]);
  const canPreview = hasWorkspace && levels.every((level) => level.tag_ids.length > 0);

  useEffect(() => {
    if (open && !initialized) {
      void fetchTags();
    }
    if (open) {
      setError(undefined);
      setPreview(null);
      setLevels([{tag_ids: []}]);
    }
  }, [open, initialized, fetchTags]);

  const handleUpdateLevel = (index: number, next: OrganizeLevelPayload) => {
    setLevels((prev) => prev.map((item, idx) => (idx === index ? next : item)));
  };

  const handleAddLevel = () => {
    setLevels((prev) => [...prev, {tag_ids: []}]);
  };

  const handleRemoveLevel = (index: number) => {
    setLevels((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const buildRequest = (): OrganizeRequestPayload => ({
    levels,
  });

  const handlePreview = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = (await PreviewOrganize(buildRequest())) as OrganizePreview;
      setPreview(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(undefined);
    try {
      const response = (await ExecuteOrganize(buildRequest())) as OrganizeResult;
      setPreview(response.preview);
      setLastOperationId(response.operation_id ?? null);
      await fetchNextPage(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setExecuting(false);
    }
  };

  const handleUndo = async () => {
    if (!lastOperationId) return;
    setUndoing(true);
    setError(undefined);
    try {
      await UndoOrganize(lastOperationId);
      setPreview(null);
      await fetchNextPage(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setUndoing(false);
    }
  };

  const renderSummary = () => {
    if (!preview) return null;
    const {summary} = preview;
    return (
      <div className="mb-3 grid grid-cols-5 gap-2 text-sm">
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          总计 {summary.total}
        </div>
        <div className="rounded-lg bg-green-100 px-3 py-2 text-green-700 dark:bg-green-900/30 dark:text-green-200">
          可移动 {summary.move_count}
        </div>
        <div className="rounded-lg bg-red-100 px-3 py-2 text-red-700 dark:bg-red-900/30 dark:text-red-200">
          冲突 {summary.conflict_count}
        </div>
        <div className="rounded-lg bg-amber-100 px-3 py-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          缺少标签 {summary.skip_count}
        </div>
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          已在位 {summary.already_in_place}
        </div>
      </div>
    );
  };

  const visibleItems = preview ? preview.items.slice(0, MAX_PREVIEW_ROWS) : [];
  const truncated = preview ? preview.items.length > MAX_PREVIEW_ROWS : false;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">一键整理</p>
            <p className="text-xs text-slate-500">
              配置标签层级后生成预览，确认无误再执行。支持同级多个标签（文件需同时满足）。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid max-h-[80vh] grid-cols-1 gap-4 overflow-y-auto p-6">
          {!hasWorkspace && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle size={16} />
              请选择工作区后再执行整理。
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900 dark:text-white">层级配置</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddLevel}
                  className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus size={14} />
                  新增层级
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {levels.map((level, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-brand/10 text-sm font-semibold text-brand">
                    {idx + 1}
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-slate-500">选择本级需要同时具备的标签</label>
                    <select
                      multiple
                      value={level.tag_ids.map(String)}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                        handleUpdateLevel(idx, {tag_ids: values});
                      }}
                      className="block min-h-[120px] w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      示例：若第1级选择 2025，第2级选择 02，则文件会移动到 [2025]/[02]/ 目录。
                      若同级选择多个标签，则生成形如 [2025][02] 的同级目录名。
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={levels.length <= 1}
                    onClick={() => handleRemoveLevel(idx)}
                    className="mt-1 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-900/20"
                    title="删除该层级"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!canPreview || loading}
              className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <Eye size={14} />
              {loading ? "生成中..." : "生成预览"}
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={!preview || executing || preview.summary.conflict_count > 0}
              className="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={14} />
              {executing ? "执行中..." : "执行整理"}
            </button>
            <button
              type="button"
              onClick={handleUndo}
              disabled={!lastOperationId || undoing}
              className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Undo2 size={14} />
              {undoing ? "撤销中..." : "撤销整理"}
            </button>
            {preview && preview.summary.conflict_count > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-200">
                <AlertTriangle size={14} />
                预览中存在 {preview.summary.conflict_count} 个冲突，处理完再执行。
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-white">预览结果</p>
                {preview && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    基准目录：{preview.base_path}
                  </span>
                )}
              </div>
              {preview && truncated && (
                <span className="text-xs text-slate-500">
                  仅展示前 {MAX_PREVIEW_ROWS} 条，完整结果请执行或调整筛选。
                </span>
              )}
            </div>

            {renderSummary()}

            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              <div className="grid grid-cols-5 gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                <span>状态</span>
                <span>原路径</span>
                <span>目标路径</span>
                <span>标签</span>
                <span>说明</span>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto">
                {preview && visibleItems.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-slate-500">暂无匹配文件</p>
                )}
                {visibleItems.map((item) => (
                  <div key={`${item.file_id}-${item.original_path}`} className="grid grid-cols-5 gap-2 px-3 py-2 text-xs">
                    <span className={`w-fit rounded px-2 py-0.5 ${statusBadge(item.status)}`}>
                      {item.status === "move" && "移动"}
                      {item.status === "conflict" && "冲突"}
                      {item.status === "skip_missing_tags" && "缺少标签"}
                      {item.status === "already_in_place" && "已在目标"}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-200" title={item.original_path}>
                      {item.original_path}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-200" title={item.target_path}>
                      {item.target_path}
                    </span>
                    <span className="truncate text-slate-600 dark:text-slate-300" title={(item.tags ?? []).join(", ")}>
                      {(item.tags ?? []).join(", ")}
                    </span>
                    <span className="truncate text-slate-600 dark:text-slate-300" title={item.message}>
                      {item.message ||
                        (item.missing_tags && item.missing_tags.length > 0
                          ? `缺少：${item.missing_tags.join(", ")}`
                          : "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default OrganizeDialog;
