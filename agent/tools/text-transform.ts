import { z } from 'zod';

/**
 * 文本转换工具定义
 *
 * 内置文本操作，无需 LLM 调用。
 */
export const textTransformTool = {
  description: 'Transform text using built-in operations like trim, truncate, replace, or case conversion.',
  parameters: z.object({
    text: z.string().describe('The text to transform'),
    operation: z.enum(['trim', 'truncate', 'replace', 'uppercase', 'lowercase', 'capitalize']).describe('The transformation to apply'),
    maxLength: z.number().optional().describe('Max length for truncate operation'),
    search: z.string().optional().describe('Search string for replace operation'),
    replacement: z.string().optional().describe('Replacement string for replace operation'),
  }),
};
