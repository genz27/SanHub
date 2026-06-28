import { openai } from '@ai-sdk/openai';

/**
 * Agent 配置定义
 *
 * model: AI 模型（支持自定义 baseURL 和 apiKey）
 * instructions: 系统提示词文件路径
 * tools: 可用工具列表
 */
export const agentConfig = {
  model: openai('gpt-4o'),
  instructions: './instructions.md',
  tools: ['image-generation', 'video-generation', 'text-transform'],
  maxSteps: 8,
} as const;
