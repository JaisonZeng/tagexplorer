// 设置相关的类型定义

// 标签应用位置
export type TagPosition = 'prefix' | 'suffix';

// 标签格式类型
export type TagFormat = 'brackets' | 'square_brackets' | 'parentheses' | 'custom';

// 标签组合方式
export type TagGrouping = 'combined' | 'individual';

// 标签应用规则配置
export interface TagRuleConfig {
  // 标签格式类型
  format: TagFormat;
  // 自定义格式（当format为custom时使用）
  customFormat?: {
    prefix: string;  // 前缀，如 "["
    suffix: string;  // 后缀，如 "]"
    separator: string; // 多个标签之间的分隔符，如 ", "
  };
  // 标签应用位置
  position: TagPosition;
  // 是否在标签前后添加空格
  addSpaces: boolean;
  // 标签组合方式
  grouping: TagGrouping;
}

// 应用设置
export interface AppSettings {
  // 标签应用规则
  tagRule: TagRuleConfig;
  // 其他设置可以在这里扩展
  // theme: ThemeSettings;
  // ui: UISettings;
}

// 默认设置
export const DEFAULT_SETTINGS: AppSettings = {
  tagRule: {
    format: 'square_brackets',
    position: 'suffix',
    addSpaces: true,
    grouping: 'combined',
  },
};

// 预设的标签格式
export const TAG_FORMAT_PRESETS: Record<TagFormat, { name: string; example: string; prefix: string; suffix: string; separator: string }> = {
  brackets: {
    name: '尖括号',
    example: '文件名 <标签1, 标签2>',
    prefix: '<',
    suffix: '>',
    separator: ', ',
  },
  square_brackets: {
    name: '方括号',
    example: '文件名 [标签1, 标签2]',
    prefix: '[',
    suffix: ']',
    separator: ', ',
  },
  parentheses: {
    name: '圆括号',
    example: '文件名 (标签1, 标签2)',
    prefix: '(',
    suffix: ')',
    separator: ', ',
  },
  custom: {
    name: '自定义',
    example: '自定义格式',
    prefix: '',
    suffix: '',
    separator: '',
  },
};

// 标签组合方式选项
export const TAG_GROUPING_OPTIONS = {
  combined: {
    name: '组合显示',
    example: '[标签1, 标签2]',
    description: '所有标签放在一个括号内，用分隔符分开',
  },
  individual: {
    name: '分别显示',
    example: '[标签1][标签2]',
    description: '每个标签都有独立的括号',
  },
};