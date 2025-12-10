import {FormEvent, useEffect, useState} from "react";
import {useShallow} from "zustand/react/shallow";
import {useTagStore} from "../store/tags";

const DEFAULT_COLOR = "#14b8a6";

const TagSidebar = () => {
  const {
    tags,
    loading,
    error,
    initialized,
    fetchTags,
    createTag,
    deleteTag,
  } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      loading: state.loading,
      error: state.error,
      initialized: state.initialized,
      fetchTags: state.fetchTags,
      createTag: state.createTag,
      deleteTag: state.deleteTag,
    })),
  );

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  useEffect(() => {
    if (!initialized) {
      void fetchTags();
    }
  }, [initialized, fetchTags]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await createTag(name, color);
    setName("");
  };

  return (
    <aside className="w-72 flex-shrink-0 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/40">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">标签库</h3>
        {loading && <span className="text-xs text-slate-400">同步中...</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        管理全局标签，创建后可在文件卡片中快速打标。
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="标签名称"
            className="flex-1 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-white"
          />
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-transparent p-1 dark:border-slate-600"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-slate-950 transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!name.trim()}
        >
          新建标签
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-2">
        {tags.length === 0 ? (
          <p className="text-xs text-slate-400">暂无标签，创建后会显示在此处。</p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border border-white/40"
                  style={{backgroundColor: tag.color}}
                />
                <span className="truncate">{tag.name}</span>
              </div>
              <button
                type="button"
                onClick={() => deleteTag(tag.id)}
                className="text-xs text-slate-400 transition hover:text-red-400"
                title="删除标签"
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

export default TagSidebar;
