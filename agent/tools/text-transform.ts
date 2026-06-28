import { defineTool } from 'eve/tools';
import { z } from 'zod';

export default defineTool({
  description: 'Transform text using built-in operations. No LLM call needed for basic text manipulation.',
  inputSchema: z.object({
    text: z.string().describe('The text to transform'),
    operation: z.enum(['trim', 'truncate', 'replace', 'uppercase', 'lowercase', 'capitalize']).describe('The transformation to apply'),
    maxLength: z.number().optional().describe('Max length for truncate operation'),
    search: z.string().optional().describe('Search string for replace operation'),
    replacement: z.string().optional().describe('Replacement string for replace operation'),
  }),
  async execute(input) {
    return { status: 'delegated', message: 'Tool execution is handled by the SanHub agent runtime.' };
  },
});
