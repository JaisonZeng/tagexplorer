import React, { useState } from 'react';
import { X, RotateCcw, FileText } from 'lucide-react';
import { useSettingsStore } from '../store/settings';
import { useShallow } from 'zustand/react/shallow';
import type { TagFormat, TagPosition, TagGrouping } from '../types/settings';
import { TAG_FORMAT_PRESETS, TAG_GROUPING_OPTIONS } from '../types/settings';
import useConfirm from '../hooks/useConfirm';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { confirm, ConfirmComponent } = useConfirm();
  
  const { settings, loading, error, updateTagRule, resetSettings, loadSettings } = useSettingsStore(
    useShallow((state) => ({
      settings: state.settings,
      loading: state.loading,
      error: state.error,
      updateTagRule: state.updateTagRule,
      resetSettings: state.resetSettings,
      loadSettings: state.loadSettings,
    }))
  );

  const [localSettings, setLocalSettings] = useState(settings);

  // 当对话框打开时，加载最新设置并重置本地设置
  React.useEffect(() => {
    if (isOpen) {
      loadSettings().then(() => {
        setLocalSettings(settings);
      });
    }
  }, [isOpen, loadSettings]);

  // 当设置更新时，同步本地设置
  React.useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [settings, isOpen]);

  const handleSave = async () => {
    try {
      await updateTagRule(localSettings.tagRule);
      onClose();
    } catch (error) {
      // 错误已经在store中处理，这里不需要额外处理
    }
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      title: '重置设置',
      message: '确定要重置所有设置到默认值吗？此操作不可撤销。',
      confirmText: '重置',
      cancelText: '取消',
      type: 'warning',
    });
    
    if (confirmed) {
      try {
        await resetSettings();
      } catch (error) {
        // 错误已经在store中处理，这里不需要额外处理
      }
    }
  };

  const handleFormatChange = (format: TagFormat) => {
    const preset = TAG_FORMAT_PRESETS[format];
    setLocalSettings(prev => ({
      ...prev,
      tagRule: {
        ...prev.tagRule,
        format,
        customFormat: format === 'custom' ? prev.tagRule.customFormat : {
          prefix: preset.prefix,
          suffix: preset.suffix,
          separator: preset.separator,
        },
      },
    }));
  };

  const handlePositionChange = (position: TagPosition) => {
    setLocalSettings(prev => ({
      ...prev,
      tagRule: {
        ...prev.tagRule,
        position,
      },
    }));
  };

  const sanitizeInput = (input: string): string => {
    // 替换文件名不允许的字符
    const replacements: Record<string, string> = {
      '|': '丨',
      '<': '＜',
      '>': '＞',
      ':': '：',
      '"': '"',
      '?': '？',
      '*': '＊',
    };
    
    let result = input;
    for (const [invalid, replacement] of Object.entries(replacements)) {
      result = result.replace(new RegExp('\\' + invalid, 'g'), replacement);
    }
    
    return result;
  };

  const handleCustomFormatChange = (field: 'prefix' | 'suffix' | 'separator', value: string) => {
    // 自动清理输入
    const cleanValue = sanitizeInput(value);
    
    setLocalSettings(prev => ({
      ...prev,
      tagRule: {
        ...prev.tagRule,
        customFormat: {
          ...prev.tagRule.customFormat!,
          [field]: cleanValue,
        },
      },
    }));
  };

  const handleAddSpacesChange = (addSpaces: boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      tagRule: {
        ...prev.tagRule,
        addSpaces,
      },
    }));
  };

  const handleGroupingChange = (grouping: TagGrouping) => {
    setLocalSettings(prev => ({
      ...prev,
      tagRule: {
        ...prev.tagRule,
        grouping,
      },
    }));
  };

  // 生成预览文本
  const generatePreview = () => {
    const { format, customFormat, position, addSpaces, grouping } = localSettings.tagRule;
    const preset = TAG_FORMAT_PRESETS[format];
    
    let prefix = format === 'custom' ? (customFormat?.prefix || '') : preset.prefix;
    let suffix = format === 'custom' ? (customFormat?.suffix || '') : preset.suffix;
    let separator = format === 'custom' ? (customFormat?.separator || '') : preset.separator;
    
    let tagText: string;
    if (grouping === 'individual') {
      // 分别显示：每个标签都有独立的括号
      tagText = `${prefix}标签1${suffix}${prefix}标签2${suffix}`;
    } else {
      // 组合显示：所有标签放在一个括号内
      tagText = `${prefix}标签1${separator}标签2${suffix}`;
    }
    
    const fileName = '示例文件名';
    const space = addSpaces ? ' ' : '';
    
    if (position === 'prefix') {
      return `${tagText}${space}${fileName}`;
    } else {
      return `${fileName}${space}${tagText}`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-800">
        {/* 标题栏 - 固定 */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            应用设置
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 - 可滚动 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
          {/* 错误提示 */}
          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* 标签应用规则 */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-white">
              标签应用规则
            </h3>
            
            {/* 标签格式 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                标签格式
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TAG_FORMAT_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => handleFormatChange(key as TagFormat)}
                    className={`rounded-md border p-3 text-left transition ${
                      localSettings.tagRule.format === key
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600'
                    }`}
                  >
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {preset.example}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义格式设置 */}
            {localSettings.tagRule.format === 'custom' && (
              <div className="mb-4 rounded-md border border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700">
                <h4 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  自定义格式设置
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                      前缀
                    </label>
                    <input
                      type="text"
                      value={localSettings.tagRule.customFormat?.prefix || ''}
                      onChange={(e) => handleCustomFormatChange('prefix', e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      placeholder="如: ["
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                      后缀
                    </label>
                    <input
                      type="text"
                      value={localSettings.tagRule.customFormat?.suffix || ''}
                      onChange={(e) => handleCustomFormatChange('suffix', e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      placeholder="如: ]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                      分隔符
                    </label>
                    <input
                      type="text"
                      value={localSettings.tagRule.customFormat?.separator || ''}
                      onChange={(e) => handleCustomFormatChange('separator', e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      placeholder="如: , "
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 注意：文件名中不能包含以下字符：&lt; &gt; : " | ? *<br/>
                  系统会自动将这些字符替换为相似的安全字符
                </div>
              </div>
            )}

            {/* 标签位置 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                标签位置
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePositionChange('prefix')}
                  className={`flex-1 rounded-md border p-3 text-center transition ${
                    localSettings.tagRule.position === 'prefix'
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600'
                  }`}
                >
                  <div className="font-medium">文件名前</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    [标签] 文件名
                  </div>
                </button>
                <button
                  onClick={() => handlePositionChange('suffix')}
                  className={`flex-1 rounded-md border p-3 text-center transition ${
                    localSettings.tagRule.position === 'suffix'
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600'
                  }`}
                >
                  <div className="font-medium">文件名后</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    文件名 [标签]
                  </div>
                </button>
              </div>
            </div>

            {/* 标签组合方式 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                标签组合方式
              </label>
              <div className="flex gap-2">
                {Object.entries(TAG_GROUPING_OPTIONS).map(([key, option]) => (
                  <button
                    key={key}
                    onClick={() => handleGroupingChange(key as TagGrouping)}
                    className={`flex-1 rounded-md border p-3 text-left transition ${
                      localSettings.tagRule.grouping === key
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600'
                    }`}
                  >
                    <div className="font-medium">{option.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {option.example}
                    </div>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 添加空格选项 */}
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={localSettings.tagRule.addSpaces}
                  onChange={(e) => handleAddSpacesChange(e.target.checked)}
                  className="rounded border-slate-300 text-brand focus:ring-brand"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  在标签和文件名之间添加空格
                </span>
              </label>
            </div>

            {/* 预览 */}
            <div className="rounded-md border border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <FileText size={16} />
                预览效果
              </div>
              <div className="rounded bg-white p-2 font-mono text-sm text-slate-900 dark:bg-slate-800 dark:text-white">
                {generatePreview()}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                💡 保存设置后，现有文件的标签格式将自动更新为新格式
              </div>
            </div>
          </section>
          </div>
        </div>

        {/* 底部按钮 - 固定 */}
        <div className="flex flex-shrink-0 justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            <RotateCcw size={16} />
            重置默认
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
      
      {/* 确认对话框 */}
      <ConfirmComponent />
    </div>
  );
};

export default SettingsDialog;