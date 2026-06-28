import { z } from 'zod';

/**
 * 图像生成工具定义
 *
 * 供 AI SDK generateText 的 tools 参数使用。
 * 实际执行在 app/api/agents/chat/route.ts 中调用 image-generator.ts。
 */
export const imageGenerationTool = {
  description: 'Generate an image from a text prompt. Returns the URL of the generated image.',
  parameters: z.object({
    prompt: z.string().describe('Detailed text prompt for the image to generate'),
    aspectRatio: z.string().optional().describe('Aspect ratio like "1:1", "16:9", "9:16"'),
    imageSize: z.string().optional().describe('Image quality/size like "1K", "2K", "4K"'),
  }),
};
