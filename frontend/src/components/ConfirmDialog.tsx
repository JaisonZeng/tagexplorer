import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  type = 'warning',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: 'text-red-500',
          confirmButton: 'bg-red-500 hover:bg-red-600 focus:ring-red-500',
          iconBg: 'bg-red-100 dark:bg-red-900/20',
        };
      case 'warning':
        return {
          icon: 'text-amber-500',
          confirmButton: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500',
          iconBg: 'bg-amber-100 dark:bg-amber-900/20',
        };
      case 'info':
        return {
          icon: 'text-blue-500',
          confirmButton: 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500',
          iconBg: 'bg-blue-100 dark:bg-blue-900/20',
        };
      default:
        return {
          icon: 'text-amber-500',
          confirmButton: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500',
          iconBg: 'bg-amber-100 dark:bg-amber-900/20',
        };
    }
  };

  const styles = getTypeStyles();

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      onConfirm();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        {/* 标题栏 */}
        <div className="mb-4 flex items-start gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}>
            <AlertTriangle size={20} className={styles.icon} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onCancel}
              className="absolute right-4 top-4 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 消息内容 */}
        <div className="mb-6 ml-13">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {message}
          </p>
        </div>

        {/* 按钮组 */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.confirmButton}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;