import { defineTool } from 'eve/tools';
import { z } from 'zod';

export default defineTool({
  description: 'Generate an image from a text prompt. Returns the URL of the generated image.',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed text description of the image to generate'),
    aspectRatio: z.string().optional().describe('Aspect ratio like "1:1", "16:9", "9:16"'),
    imageSize: z.string().optional().describe('Image quality/size like "1K", "2K", "4K"'),
  }),
  async execute(input) {
    // This tool is a definition layer - the actual execution happens
    // in the AI SDK tool-calling loop in the API route.
    // The execute function is for reference/documentation.
    return { status: 'delegated', message: 'Tool execution is handled by the SanHub agent runtime.' };
  },
});
