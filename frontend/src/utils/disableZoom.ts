/**
 * 禁用浏览器缩放功能的工具函数
 */

/**
 * 禁用 Ctrl+滚轮 和键盘缩放快捷键
 */
export function disableZoom(): () => void {
  const handleWheel = (e: WheelEvent) => {
    // 检测是否按下了 Ctrl 键（或 Cmd 键在 Mac 上）
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // 禁用 Ctrl/Cmd + Plus/Minus/0 缩放快捷键
    if ((e.ctrlKey || e.metaKey) && (
      e.key === '+' || 
      e.key === '-' || 
      e.key === '=' || 
      e.key === '0' ||
      e.code === 'Equal' ||
      e.code === 'Minus' ||
      e.code === 'Digit0'
    )) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    // 禁用多点触控缩放
    if (e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  const handleGestureStart = (e: Event) => {
    // 禁用手势缩放（Safari）
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  // 添加事件监听器，使用 passive: false 确保可以阻止默认行为
  document.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('keydown', handleKeyDown, { passive: false });
  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('gesturestart', handleGestureStart, { passive: false });

  // 返回清理函数
  return () => {
    document.removeEventListener('wheel', handleWheel);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('gesturestart', handleGestureStart);
  };
}

/**
 * 强制重置页面缩放到 100%
 */
export function resetZoom(): void {
  // 重置 CSS zoom 属性
  (document.body.style as any).zoom = '1';
  
  // 重置 CSS transform scale
  document.body.style.transform = 'scale(1)';
  document.body.style.transformOrigin = '0 0';
  
  // 尝试重置浏览器缩放（仅在某些浏览器中有效）
  try {
    (document.body.style as any).zoom = 'reset';
  } catch (e) {
    // 忽略错误
  }
}