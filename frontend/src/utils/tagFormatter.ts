import type { TagRuleConfig, TagFormat } from '../types/settings';
import { TAG_FORMAT_PRESETS } from '../types/settings';
import type { TagInfo } from '../types/files';

/**
 * 根据设置格式化标签文本
 */
export function formatTagsText(tags: TagInfo[], config: TagRuleConfig): string {
  if (tags.length === 0) return '';

  const { format, customFormat, addSpaces } = config;
  const preset = TAG_FORMAT_PRESETS[format];
  
  let prefix = format === 'custom' ? (customFormat?.prefix || '') : preset.prefix;
  let suffix = format === 'custom' ? (customFormat?.suffix || '') : preset.suffix;
  let separator = format === 'custom' ? (customFormat?.separator || '') : preset.separator;
  
  const tagNames = tags.map(tag => tag.name).join(separator);
  return `${prefix}${tagNames}${suffix}`;
}

/**
 * 根据设置应用标签到文件名
 */
export function applyTagsToFileName(fileName: string, tags: TagInfo[], config: TagRuleConfig): string {
  if (tags.length === 0) return fileName;

  const tagsText = formatTagsText(tags, config);
  const space = config.addSpaces ? ' ' : '';
  
  if (config.position === 'prefix') {
    return `${tagsText}${space}${fileName}`;
  } else {
    return `${fileName}${space}${tagsText}`;
  }
}

/**
 * 从文件名中移除标签
 * 这个函数尝试识别并移除文件名中的标签部分
 */
export function removeTagsFromFileName(fileName: string, config: TagRuleConfig): string {
  const { format, customFormat, position, addSpaces } = config;
  const preset = TAG_FORMAT_PRESETS[format];
  
  let prefix = format === 'custom' ? (customFormat?.prefix || '') : preset.prefix;
  let suffix = format === 'custom' ? (customFormat?.suffix || '') : preset.suffix;
  
  if (!prefix || !suffix) return fileName;
  
  // 转义特殊字符用于正则表达式
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPrefix = escapeRegex(prefix);
  const escapedSuffix = escapeRegex(suffix);
  
  const space = addSpaces ? '\\s*' : '';
  
  let pattern: RegExp;
  
  if (position === 'prefix') {
    // 标签在前面: [标签] 文件名
    pattern = new RegExp(`^${escapedPrefix}[^${escapedSuffix}]*${escapedSuffix}${space}`, 'g');
  } else {
    // 标签在后面: 文件名 [标签]
    pattern = new RegExp(`${space}${escapedPrefix}[^${escapedSuffix}]*${escapedSuffix}$`, 'g');
  }
  
  return fileName.replace(pattern, '').trim();
}

/**
 * 解析文件名中的标签
 * 尝试从文件名中提取标签信息
 */
export function parseTagsFromFileName(fileName: string, config: TagRuleConfig): string[] {
  const { format, customFormat, position } = config;
  const preset = TAG_FORMAT_PRESETS[format];
  
  let prefix = format === 'custom' ? (customFormat?.prefix || '') : preset.prefix;
  let suffix = format === 'custom' ? (customFormat?.suffix || '') : preset.suffix;
  let separator = format === 'custom' ? (customFormat?.separator || '') : preset.separator;
  
  if (!prefix || !suffix) return [];
  
  // 转义特殊字符用于正则表达式
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPrefix = escapeRegex(prefix);
  const escapedSuffix = escapeRegex(suffix);
  
  let pattern: RegExp;
  
  if (position === 'prefix') {
    // 标签在前面: [标签] 文件名
    pattern = new RegExp(`^${escapedPrefix}([^${escapedSuffix}]*)${escapedSuffix}`, 'g');
  } else {
    // 标签在后面: 文件名 [标签]
    pattern = new RegExp(`${escapedPrefix}([^${escapedSuffix}]*)${escapedSuffix}$`, 'g');
  }
  
  const match = pattern.exec(fileName);
  if (!match || !match[1]) return [];
  
  const tagsText = match[1].trim();
  if (!tagsText) return [];
  
  // 按分隔符分割标签
  return tagsText.split(separator).map(tag => tag.trim()).filter(tag => tag.length > 0);
}

/**
 * 生成预览文本
 */
export function generatePreviewText(config: TagRuleConfig, fileName: string = '示例文件名', tagNames: string[] = ['标签1', '标签2']): string {
  const mockTags: TagInfo[] = tagNames.map((name, index) => ({
    id: index + 1,
    name,
    color: '#94a3b8',
  }));
  
  return applyTagsToFileName(fileName, mockTags, config);
}