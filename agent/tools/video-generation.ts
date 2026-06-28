import { z } from 'zod';

/**
 * 视频生成工具定义
 *
 * 供 AI SDK generateText 的 tools 参数使用。
 * 实际执行在 app/api/agents/chat/route.ts 中调用 sora-api.ts。
 */
export const videoGenerationTool = {
  description: 'Generate a video from a text prompt. Returns a task ID — videos are generated asynchronously.',
  parameters: z.object({
    prompt: z.string().describe('Detailed text description of the video to generate'),
    aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().describe('Video aspect ratio'),
    duration: z.string().optional().describe('Video duration like "10s", "15s"'),
  }),
};
