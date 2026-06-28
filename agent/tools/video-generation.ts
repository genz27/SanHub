import { defineTool } from 'eve/tools';
import { z } from 'zod';

export default defineTool({
  description: 'Generate a video from a text prompt. Returns a task ID - videos are generated asynchronously.',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed text description of the video to generate'),
    aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().describe('Video aspect ratio'),
    duration: z.string().optional().describe('Video duration like "10s", "15s"'),
  }),
  async execute(input) {
    return { status: 'delegated', message: 'Tool execution is handled by the SanHub agent runtime.' };
  },
});
