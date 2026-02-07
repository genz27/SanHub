/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveCharacterCard, updateCharacterCard, deleteCharacterCard, getUserById } from '@/lib/db';
import { createCharacterCard } from '@/lib/sora-api';
import { uploadToPicUI } from '@/lib/picui';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { assertPromptsAllowed, isPromptBlockedError } from '@/lib/prompt-blocklist';

// 配置路由段选项
export const maxDuration = 300; // 5分钟超时
export const dynamic = 'force-dynamic';

interface CharacterCardRequest {
  // 视频模式（二选一）
  videoBase64?: string; // base64 编码的视频数据
  firstFrameBase64?: string; // 视频第一帧的 base64 图片
  // 图生角色卡模式（二选一）
  inputImage?: string; // base64 编码的参考图片
  prompt?: string; // 图生角色卡时的提示词（可选）
  styleId?: string; // 视频风格（仅图生角色卡时生效）
  // 通用参数
  username?: string; // 自定义角色用户名（不含 @）
  displayName?: string; // 自定义角色显示名称
  instructionSet?: string; // 角色指令集
  safetyInstructionSet?: string; // 安全指令集
  timestamps?: string; // 时间戳
}

// 后台处理任务
async function processCharacterCardTask(
  cardId: string,
  userId: string,
  body: CharacterCardRequest
): Promise<void> {
  try {
    const isImageMode = !body.videoBase64 && body.inputImage;
    console.log(`[Task ${cardId}] 开始处理角色卡生成任务 (模式: ${isImageMode ? '图生角色卡' : '视频'})`);

    // 调用非流式 API
    const result = await createCharacterCard({
      // 视频模式
      video_base64: body.videoBase64,
      // 图生角色卡模式
      input_image: body.inputImage,
      prompt: body.prompt,
      style_id: body.styleId,
      // 通用参数
      model: 'sora-video-10s',
      timestamps: body.timestamps || '0,3',
      username: body.username,
      display_name: body.displayName,
      instruction_set: body.instructionSet,
      safety_instruction_set: body.safetyInstructionSet,
    });

    // 调试日志：打印完整返回结果
    console.log(`[Task ${cardId}] API 返回结果:`, JSON.stringify(result));

    // 尝试从多个来源获取角色名称
    // 1. 直接从 data 字段获取
    let returnedUsername = result.data?.username;
    let returnedDisplayName = result.data?.display_name;
    const cameoId = result.data?.cameo_id;

    // 2. 如果 data.message 是 JSON 字符串，尝试解析
    if (!returnedUsername && result.data?.message && result.data.message.startsWith('{')) {
      try {
        const messageData = JSON.parse(result.data.message);
        returnedUsername = messageData.username;
        returnedDisplayName = messageData.display_name;
        console.log(`[Task ${cardId}] 从 message 解析: username=${returnedUsername}`);
      } catch {
        // message 不是 JSON，忽略
      }
    }

    // 3. 使用 cameo_id 或 result.id 作为备选
    const characterName = returnedUsername || returnedDisplayName || cameoId || result.id || '未命名角色';

    console.log(`[Task ${cardId}] 角色卡创建成功: ${characterName}`);

    // 更新角色卡记录为完成状态
    await updateCharacterCard(cardId, {
      characterName,
      status: 'completed',
    });

    console.log(`[Task ${cardId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${cardId}] 角色卡生成失败:`, error);

    // 失败时更新为 failed 状态，而不是删除
    const errorMessage = error instanceof Error ? error.message : '生成失败';
    await updateCharacterCard(cardId, {
      status: 'failed',
      errorMessage,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'generate-character-card');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body: CharacterCardRequest = await request.json();

    await assertPromptsAllowed([
      body.prompt,
      body.username,
      body.displayName,
      body.instructionSet,
      body.safetyInstructionSet,
      body.styleId,
    ]);

    if (!body.videoBase64 && !body.inputImage) {
      return NextResponse.json(
        { error: '请上传视频或图片' },
        { status: 400 }
      );
    }

    const isImageMode = !body.videoBase64 && body.inputImage;

    // 获取最新用户信息
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    // 尝试上传头像到 PicUI 图床
    // 图生角色卡模式使用 inputImage，视频模式使用 firstFrameBase64
    const avatarSource = isImageMode ? body.inputImage : body.firstFrameBase64;
    let avatarUrl = avatarSource || '';
    if (avatarSource) {
      try {
        const picuiUrl = await uploadToPicUI(avatarSource, `avatar_${Date.now()}.jpg`);
        if (picuiUrl) {
          avatarUrl = picuiUrl;
          console.log('[API] 角色卡头像已上传到 PicUI:', picuiUrl);
        }
      } catch (err) {
        console.warn('[API] PicUI 上传失败，使用 base64:', err);
      }
    }

    // 创建角色卡记录（状态为 processing）
    const card = await saveCharacterCard({
      userId: user.id,
      characterName: '',
      avatarUrl,
      sourceVideoUrl: undefined,
      status: 'processing',
    });

    // 在后台异步处理（不等待完成）
    processCharacterCardTask(card.id, user.id, body).catch((err) => {
      console.error('[API] 角色卡后台任务启动失败:', err);
    });

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      data: {
        id: card.id,
        status: 'processing',
        message: '角色卡创建任务已提交，正在后台处理中',
      },
    });
  } catch (error) {
    console.error('[API] Character card generation error:', error);

    const errorMessage = error instanceof Error ? error.message : '生成失败';

    if (isPromptBlockedError(error)) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
