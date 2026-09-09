import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createImageChannel,
  createImageModel,
  getImageChannels,
  getImageModels,
} from '@/lib/db/image-channels';
import { initializeImageChannelsTables } from '@/lib/db/schema';
import { getSystemConfig } from '@/lib/db/system-config';
import type { ChannelType, ImageModelFeatures } from '@/types';

export const dynamic = 'force-dynamic';

// POST - 执行迁移
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    await initializeImageChannelsTables();

    // 检查是否已有数据
    const existingChannels = await getImageChannels();
    if (existingChannels.length > 0) {
      return NextResponse.json({
        success: false,
        error: '已存在渠道配置，请手动管理',
        channels: existingChannels.length,
      });
    }

    // 获取现有配置
    const config = await getSystemConfig();

    // 创建渠道
    const channels: Array<{ id: string; name: string; type: ChannelType }> = [];

    // Sora
    const soraChannel = await createImageChannel({
      name: 'Sora',
      type: 'sora',
      baseUrl: config.soraBaseUrl || 'http://localhost:8000',
      apiKey: config.soraApiKey || '',
      enabled: true,
    });
    channels.push({ id: soraChannel.id, name: 'Sora', type: 'sora' });

    // Gemini
    const geminiChannel = await createImageChannel({
      name: 'Gemini',
      type: 'gemini',
      baseUrl: config.geminiBaseUrl || 'https://generativelanguage.googleapis.com',
      apiKey: config.geminiApiKey || '',
      enabled: true,
    });
    channels.push({ id: geminiChannel.id, name: 'Gemini', type: 'gemini' });

    // ModelScope
    const modelscopeChannel = await createImageChannel({
      name: 'ModelScope',
      type: 'modelscope',
      baseUrl: config.zimageBaseUrl || 'https://api-inference.modelscope.cn/',
      apiKey: config.zimageApiKey || '',
      enabled: true,
    });
    channels.push({ id: modelscopeChannel.id, name: 'ModelScope', type: 'modelscope' });

    // Gitee AI
    const giteeChannel = await createImageChannel({
      name: 'Gitee AI',
      type: 'gitee',
      baseUrl: config.giteeBaseUrl || 'https://ai.gitee.com/',
      apiKey: [config.giteeFreeApiKey, config.giteeApiKey].filter(Boolean).join(','),
      enabled: true,
    });
    channels.push({ id: giteeChannel.id, name: 'Gitee AI', type: 'gitee' });

    // 创建模型
    const modelsCreated: string[] = [];

    // Sora Image
    await createImageModel({
      channelId: soraChannel.id,
      name: 'Sora Image',
      description: '高质量图像',
      apiModel: 'sora-image',
      features: { textToImage: true, imageToImage: true, upscale: false, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['1:1', '3:2', '2:3'],
      resolutions: { '1:1': '1024x1024', '3:2': '1792x1024', '2:3': '1024x1792' },
      defaultAspectRatio: '1:1',
      enabled: true,
      costPerGeneration: config.pricing.soraImage || 50,
      sortOrder: 0,
    });
    modelsCreated.push('Sora Image');

    // Gemini Nano
    await createImageModel({
      channelId: geminiChannel.id,
      name: 'Gemini Nano',
      description: '极速生成',
      apiModel: 'gemini-3.1-flash-image-preview',
      features: { textToImage: true, imageToImage: true, upscale: false, matting: false, multipleImages: true, imageSize: false },
      aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      resolutions: {
        '1:1': '1024x1024', '2:3': '832x1248', '3:2': '1248x832',
        '3:4': '864x1184', '4:3': '1184x864', '4:5': '896x1152',
        '5:4': '1152x896', '9:16': '768x1344', '16:9': '1344x768', '21:9': '1536x672',
      },
      defaultAspectRatio: '1:1',
      enabled: true,
      costPerGeneration: config.pricing.geminiNano || 10,
      sortOrder: 1,
    });
    modelsCreated.push('Gemini Nano');

    // Gemini Pro
    await createImageModel({
      channelId: geminiChannel.id,
      name: 'Gemini Pro',
      description: '4K 高清',
      apiModel: 'gemini-3-pro-image-preview',
      features: { textToImage: true, imageToImage: true, upscale: false, matting: false, multipleImages: true, imageSize: true },
      aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      imageSizes: ['1K', '2K', '4K'],
      resolutions: {
        '1K': { '1:1': '1024x1024', '2:3': '848x1264', '3:2': '1264x848', '3:4': '896x1200', '4:3': '1200x896', '4:5': '928x1152', '5:4': '1152x928', '9:16': '768x1376', '16:9': '1376x768', '21:9': '1584x672' },
        '2K': { '1:1': '2048x2048', '2:3': '1696x2528', '3:2': '2528x1696', '3:4': '1792x2400', '4:3': '2400x1792', '4:5': '1856x2304', '5:4': '2304x1856', '9:16': '1536x2752', '16:9': '2752x1536', '21:9': '3168x1344' },
        '4K': { '1:1': '4096x4096', '2:3': '3392x5056', '3:2': '5056x3392', '3:4': '3584x4800', '4:3': '4800x3584', '4:5': '3712x4608', '5:4': '4608x3712', '9:16': '3072x5504', '16:9': '5504x3072', '21:9': '6336x2688' },
      },
      defaultAspectRatio: '1:1',
      defaultImageSize: '1K',
      enabled: true,
      costPerGeneration: config.pricing.geminiPro || 30,
      sortOrder: 2,
    });
    modelsCreated.push('Gemini Pro');

    // Z-Image Gitee
    await createImageModel({
      channelId: giteeChannel.id,
      name: 'Z-Image Gitee',
      description: '2K 高清',
      apiModel: 'z-image-turbo',
      features: { textToImage: true, imageToImage: false, upscale: false, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'],
      resolutions: { '1:1': '2048x2048', '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2048x1360', '2:3': '1360x2048', '16:9': '2048x1152', '9:16': '1152x2048' },
      defaultAspectRatio: '1:1',
      enabled: true,
      costPerGeneration: config.pricing.giteeImage || 30,
      sortOrder: 3,
    });
    modelsCreated.push('Z-Image Gitee');

    // Z-Image ModelScope
    await createImageModel({
      channelId: modelscopeChannel.id,
      name: 'Z-Image ModelScope',
      description: '1K 标准',
      apiModel: 'Tongyi-MAI/Z-Image-Turbo',
      features: { textToImage: true, imageToImage: false, upscale: false, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
      resolutions: { '1:1': '1024x1024', '1:2': '720x1440', '4:3': '1152x864', '3:4': '864x1152', '16:9': '1280x720', '9:16': '720x1280' },
      defaultAspectRatio: '1:1',
      enabled: true,
      costPerGeneration: config.pricing.zimageImage || 30,
      sortOrder: 4,
    });
    modelsCreated.push('Z-Image ModelScope');

    // Qwen Image
    await createImageModel({
      channelId: modelscopeChannel.id,
      name: 'Qwen Image',
      description: 'ModelScope 文生图',
      apiModel: 'Qwen/Qwen-Image',
      features: { textToImage: true, imageToImage: false, upscale: false, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
      resolutions: { '1:1': '1024x1024', '1:2': '720x1440', '4:3': '1152x864', '3:4': '864x1152', '16:9': '1280x720', '9:16': '720x1280' },
      defaultAspectRatio: '1:1',
      enabled: true,
      costPerGeneration: config.pricing.zimageImage || 30,
      sortOrder: 5,
    });
    modelsCreated.push('Qwen Image');

    // Qwen Image Edit
    await createImageModel({
      channelId: modelscopeChannel.id,
      name: 'Qwen Image Edit',
      description: 'ModelScope 图像编辑',
      apiModel: 'Qwen/Qwen-Image-Edit-2509',
      features: { textToImage: false, imageToImage: true, upscale: false, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
      resolutions: { '1:1': '1024x1024', '1:2': '720x1440', '4:3': '1152x864', '3:4': '864x1152', '16:9': '1280x720', '9:16': '720x1280' },
      defaultAspectRatio: '1:1',
      requiresReferenceImage: true,
      enabled: true,
      costPerGeneration: config.pricing.zimageImage || 30,
      sortOrder: 6,
    });
    modelsCreated.push('Qwen Image Edit');

    // FLUX.2 Dev
    await createImageModel({
      channelId: modelscopeChannel.id,
      name: 'FLUX.2 Dev',
      description: 'ModelScope 图生图',
      apiModel: 'black-forest-labs/FLUX.2-dev',
      features: { textToImage: true, imageToImage: true, upscale: false, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
      resolutions: { '1:1': '1024x1024', '1:2': '720x1440', '4:3': '1152x864', '3:4': '864x1152', '16:9': '1280x720', '9:16': '720x1280' },
      defaultAspectRatio: '1:1',
      enabled: true,
      costPerGeneration: config.pricing.zimageImage || 30,
      sortOrder: 7,
    });
    modelsCreated.push('FLUX.2 Dev');

    // RMBG 2.0
    await createImageModel({
      channelId: giteeChannel.id,
      name: 'RMBG 2.0',
      description: 'Gitee AI 抠图',
      apiModel: 'RMBG-2.0',
      features: { textToImage: false, imageToImage: false, upscale: false, matting: true, multipleImages: false, imageSize: false },
      aspectRatios: ['原图'],
      resolutions: { '原图': '' },
      defaultAspectRatio: '原图',
      requiresReferenceImage: true,
      allowEmptyPrompt: true,
      enabled: true,
      costPerGeneration: config.pricing.giteeImage || 30,
      sortOrder: 8,
    });
    modelsCreated.push('RMBG 2.0');

    // SeedVR2 HD
    await createImageModel({
      channelId: giteeChannel.id,
      name: 'SeedVR2 HD',
      description: 'Gitee AI 超清修复',
      apiModel: 'SeedVR2-3B',
      features: { textToImage: false, imageToImage: false, upscale: true, matting: false, multipleImages: false, imageSize: false },
      aspectRatios: ['原图'],
      resolutions: { '原图': '' },
      defaultAspectRatio: '原图',
      requiresReferenceImage: true,
      allowEmptyPrompt: true,
      highlight: true,
      enabled: true,
      costPerGeneration: config.pricing.giteeImage || 30,
      sortOrder: 9,
    });
    modelsCreated.push('SeedVR2 HD');

    return NextResponse.json({
      success: true,
      message: '迁移完成',
      channels: channels.length,
      models: modelsCreated.length,
      channelList: channels.map(c => c.name),
      modelList: modelsCreated,
    });
  } catch (error) {
    console.error('[API] Migration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '迁移失败' },
      { status: 500 }
    );
  }
}

// GET - 检查迁移状态
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    await initializeImageChannelsTables();
    const channels = await getImageChannels();
    const models = await getImageModels();

    return NextResponse.json({
      success: true,
      migrated: channels.length > 0,
      channels: channels.length,
      models: models.length,
    });
  } catch (error) {
    console.error('[API] Check migration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '检查失败' },
      { status: 500 }
    );
  }
}
