import React from 'react';

/**
 * 缩放测试面板组件
 * 用于测试缩放禁用功能是否正常工作
 */
const ZoomTestPanel: React.FC = () => {
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-white p-4 shadow-lg dark:bg-slate-800">
      <div className="text-sm">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
          缩放测试
        </h3>
        <div className="space-y-1 text-slate-600 dark:text-slate-300">
          <p>• 尝试 Ctrl + 滚轮</p>
          <p>• 尝试 Ctrl + Plus/Minus</p>
          <p>• 尝试 Ctrl + 0</p>
          <p className="text-xs text-green-600 dark:text-green-400">
            如果缩放被禁用，页面不应该缩放
          </p>
        </div>
      </div>
    </div>
  );
};

export default ZoomTestPanel;