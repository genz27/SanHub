import type { SystemConfig, PricingConfig, ImageBucketConfig, ImageStorageConfig } from '@/types';
import { getAdapter } from './connection';
import { initializeDatabase } from './schema';
import { cache, CacheKeys, CacheTTL, withCache } from '../cache';

// ========================================
// 系统配置操作
// ========================================

const LEGACY_IMAGE_BUCKET_ID = 'legacy-picui-default';

function sanitizeImageBucket(
  value: unknown,
  index: number
): ImageBucketConfig | null {
  if (!value || typeof value !== 'object') return null;

  const bucket = value as Record<string, unknown>;
  const provider =
    bucket.provider === 's3-compatible' ? 's3-compatible' : 'picui';
  const id =
    typeof bucket.id === 'string' && bucket.id.trim()
      ? bucket.id.trim()
      : `bucket-${index + 1}`;

  return {
    id,
    name:
      typeof bucket.name === 'string' && bucket.name.trim()
        ? bucket.name.trim()
        : `Bucket ${index + 1}`,
    provider,
    baseUrl: typeof bucket.baseUrl === 'string' ? bucket.baseUrl.trim() : '',
    apiKey: typeof bucket.apiKey === 'string' ? bucket.apiKey.trim() : '',
    secretKey:
      typeof bucket.secretKey === 'string' ? bucket.secretKey.trim() : undefined,
    bucketName:
      typeof bucket.bucketName === 'string' ? bucket.bucketName.trim() : undefined,
    region: typeof bucket.region === 'string' ? bucket.region.trim() : undefined,
    publicBaseUrl:
      typeof bucket.publicBaseUrl === 'string'
        ? bucket.publicBaseUrl.trim()
        : undefined,
    pathPrefix:
      typeof bucket.pathPrefix === 'string' ? bucket.pathPrefix.trim() : undefined,
    forcePathStyle: bucket.forcePathStyle !== false,
    enabled: bucket.enabled !== false,
  };
}

function parseImageStorageBuckets(raw: unknown): ImageBucketConfig[] {
  if (!raw) return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((value, index) => sanitizeImageBucket(value, index))
    .filter((bucket): bucket is ImageBucketConfig => Boolean(bucket));
}

function buildLegacyPicuiBucket(
  baseUrl: string,
  apiKey: string
): ImageBucketConfig | null {
  if (!baseUrl && !apiKey) return null;

  return {
    id: LEGACY_IMAGE_BUCKET_ID,
    name: 'Legacy PicUI',
    provider: 'picui',
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    enabled: true,
    forcePathStyle: true,
  };
}

function resolveImageStorageConfig(row?: Record<string, unknown>): ImageStorageConfig {
  const buckets = parseImageStorageBuckets(row?.image_storage_buckets);
  const defaultBucketId =
    typeof row?.image_storage_default_bucket_id === 'string'
      ? row.image_storage_default_bucket_id.trim()
      : '';

  if (buckets.length > 0) {
    return {
      defaultBucketId:
        defaultBucketId ||
        buckets.find((bucket) => bucket.enabled)?.id ||
        buckets[0]?.id,
      buckets,
    };
  }

  const legacyBucket = buildLegacyPicuiBucket(
    typeof row?.picui_base_url === 'string' ? row.picui_base_url : '',
    typeof row?.picui_api_key === 'string' ? row.picui_api_key : ''
  );

  return {
    defaultBucketId: legacyBucket?.id,
    buckets: legacyBucket ? [legacyBucket] : [],
  };
}

export async function getSystemConfig(): Promise<SystemConfig> {
  await initializeDatabase();
  return withCache(CacheKeys.SYSTEM_CONFIG, CacheTTL.SYSTEM_CONFIG, async () => {
    const db = getAdapter();

    const [rows] = await db.execute('SELECT * FROM system_config WHERE id = 1');
    const configs = rows as any[];

    if (configs.length === 0) {
      // 返回默认配置
      return {
        soraApiKey: process.env.SORA_API_KEY || '',
        soraBaseUrl: process.env.SORA_BASE_URL || 'http://localhost:8000',
        soraBackendUrl: '',
        soraBackendUsername: '',
        soraBackendPassword: '',
        soraBackendToken: '',
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
      zimageApiKey: process.env.ZIMAGE_API_KEY || '',
      zimageBaseUrl: process.env.ZIMAGE_BASE_URL || 'https://api-inference.modelscope.cn/',
        giteeFreeApiKey: process.env.GITEE_FREE_API_KEY || '',
        giteeApiKey: process.env.GITEE_API_KEY || '',
        giteeBaseUrl: process.env.GITEE_BASE_URL || 'https://ai.gitee.com/',
        picuiApiKey: process.env.PICUI_API_KEY || '',
        picuiBaseUrl: process.env.PICUI_BASE_URL || 'https://picui.cn/api/v1',
        imageStorage: {
          defaultBucketId:
            process.env.PICUI_API_KEY || process.env.PICUI_BASE_URL
              ? LEGACY_IMAGE_BUCKET_ID
              : undefined,
          buckets:
            process.env.PICUI_API_KEY || process.env.PICUI_BASE_URL
              ? [
                  {
                    id: LEGACY_IMAGE_BUCKET_ID,
                    name: 'Legacy PicUI',
                    provider: 'picui',
                    baseUrl:
                      process.env.PICUI_BASE_URL || 'https://picui.cn/api/v1',
                    apiKey: process.env.PICUI_API_KEY || '',
                    enabled: true,
                    forcePathStyle: true,
                  },
                ]
              : [],
        },
        pricing: {
          soraVideo10s: 100,
          soraVideo15s: 150,
          soraVideo25s: 200,
          soraImage: 50,
          geminiNano: 10,
          geminiPro: 30,
          zimageImage: 30,
          giteeImage: 30,
        },
        registerEnabled: true,
        defaultBalance: 100,
        featureFlags: {
          squareEnabled: true,
          gachaEnabled: true,
          characterCardEnabled: true,
        },
        inviteSettings: {
          enabled: true,
          rewardEnabled: true,
          inviteeBonusPoints: 100,
          inviterBonusPoints: 50,
        },
        announcement: {
          title: '',
          content: '',
          enabled: false,
          updatedAt: 0,
        },
        channelEnabled: {
          sora: true,
          gemini: true,
          zimage: true,
          gitee: true,
        },
        dailyLimit: {
          imageLimit: 0,
          videoLimit: 0,
          characterCardLimit: 0,
        },
        siteConfig: {
          siteName: 'SANHUB',
          siteTagline: 'Let Imagination Come Alive',
          siteDescription: '「SANHUB」是专为 AI 创作打造的一站式平台',
          siteSubDescription: '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。',
          contactEmail: 'support@sanhub.com',
          copyright: 'Copyright © 2025 SANHUB',
          poweredBy: 'Powered by OpenAI Sora & Google Gemini',
        },
        disabledModels: {
          imageModels: [],
          videoModels: [],
        },
        videoProxyEnabled: false,
        videoProxyBaseUrl: '',
        promptProcessing: {
          filterEnabled: false,
          filterModelId: '',
          filterPrompt: 'You are a safety prompt filter for video generation. Rewrite the user prompt into a safe version while preserving creative intent as much as possible. Return only the rewritten prompt text.',
          translateEnabled: false,
          translateModelId: '',
          translatePrompt: 'Translate the user prompt into clear, natural English for video generation. Preserve details, style, and constraints. Return only the translated prompt text.',
          blocklistEnabled: false,
          blocklistWords: '',
        },
        rateLimit: {
          imageMaxRequests: 30,
          imageWindowSeconds: 60,
          videoMaxRequests: 30,
          videoWindowSeconds: 60,
        },
      };
    }

    const row = configs[0];
    const imageStorage = resolveImageStorageConfig(row);
    return {
      soraApiKey: row.sora_api_key || '',
      soraBaseUrl: row.sora_base_url || 'http://localhost:8000',
      soraBackendUrl: row.sora_backend_url || '',
      soraBackendUsername: row.sora_backend_username || '',
      soraBackendPassword: row.sora_backend_password || '',
      soraBackendToken: row.sora_backend_token || '',
      geminiApiKey: row.gemini_api_key || '',
    geminiBaseUrl: row.gemini_base_url || 'https://generativelanguage.googleapis.com',
    zimageApiKey: row.zimage_api_key || '',
    zimageBaseUrl: row.zimage_base_url || 'https://api-inference.modelscope.cn/',
    giteeFreeApiKey: row.gitee_free_api_key || '',
    giteeApiKey: row.gitee_api_key || '',
    giteeBaseUrl: row.gitee_base_url || 'https://ai.gitee.com/',
      picuiApiKey: row.picui_api_key || '',
      picuiBaseUrl: row.picui_base_url || 'https://picui.cn/api/v1',
      imageStorage,
      pricing: {
        soraVideo10s: row.pricing_sora_video_10s || 100,
        soraVideo15s: row.pricing_sora_video_15s || 150,
        soraVideo25s: row.pricing_sora_video_25s || 200,
        soraImage: row.pricing_sora_image || 50,
        geminiNano: row.pricing_gemini_nano || 10,
        geminiPro: row.pricing_gemini_pro || 30,
        zimageImage: row.pricing_zimage_image || 30,
        giteeImage: row.pricing_gitee_image || 30,
      },
      registerEnabled: Boolean(row.register_enabled),
      defaultBalance: row.default_balance || 100,
      featureFlags: {
        squareEnabled: row.square_enabled !== 0,
        gachaEnabled: row.gacha_enabled !== 0,
        characterCardEnabled: row.character_card_enabled !== 0,
      },
      inviteSettings: {
        enabled: row.invite_enabled !== 0,
        rewardEnabled: row.invite_reward_enabled !== 0,
        inviteeBonusPoints: Number(row.invite_invitee_bonus) || 100,
        inviterBonusPoints: Number(row.invite_inviter_bonus) || 50,
      },
      announcement: {
        title: row.announcement_title || '',
        content: row.announcement_content || '',
        enabled: Boolean(row.announcement_enabled),
        updatedAt: Number(row.announcement_updated_at) || 0,
      },
      channelEnabled: {
        sora: row.channel_sora_enabled !== 0,
        gemini: row.channel_gemini_enabled !== 0,
        zimage: row.channel_zimage_enabled !== 0,
        gitee: row.channel_gitee_enabled !== 0,
      },
      dailyLimit: {
        imageLimit: row.daily_limit_image || 0,
        videoLimit: row.daily_limit_video || 0,
        characterCardLimit: row.daily_limit_character_card || 0,
      },
      siteConfig: {
        siteName: row.site_name || 'SANHUB',
        siteTagline: row.site_tagline || 'Let Imagination Come Alive',
        siteDescription: row.site_description || '「SANHUB」是专为 AI 创作打造的一站式平台',
        siteSubDescription: row.site_sub_description || '我们融合了 Sora 视频生成、Gemini 图像创作与多模型 AI 对话。在这里，技术壁垒已然消融，你唯一的使命就是释放纯粹的想象。',
        contactEmail: row.contact_email || 'support@sanhub.com',
        copyright: row.site_copyright || 'Copyright © 2025 SANHUB',
        poweredBy: row.site_powered_by || 'Powered by OpenAI Sora & Google Gemini',
      },
      disabledModels: {
        imageModels: row.disabled_image_models ? JSON.parse(row.disabled_image_models) : [],
        videoModels: row.disabled_video_models ? JSON.parse(row.disabled_video_models) : [],
      },
      videoProxyEnabled: Boolean(row.video_proxy_enabled),
      videoProxyBaseUrl: row.video_proxy_base_url || '',
      promptProcessing: {
        filterEnabled: Boolean(row.prompt_filter_enabled),
        filterModelId: row.prompt_filter_model_id || '',
        filterPrompt: row.prompt_filter_prompt || 'You are a safety prompt filter for video generation. Rewrite the user prompt into a safe version while preserving creative intent as much as possible. Return only the rewritten prompt text.',
        translateEnabled: Boolean(row.prompt_translate_enabled),
        translateModelId: row.prompt_translate_model_id || '',
        translatePrompt: row.prompt_translate_prompt || 'Translate the user prompt into clear, natural English for video generation. Preserve details, style, and constraints. Return only the translated prompt text.',
        blocklistEnabled: Boolean(row.prompt_blocklist_enabled),
        blocklistWords: row.prompt_blocklist_words || '',
      },
      rateLimit: {
        imageMaxRequests: Number(row.rate_limit_image_max_requests) || 30,
        imageWindowSeconds: Number(row.rate_limit_image_window_seconds) || 60,
        videoMaxRequests: Number(row.rate_limit_video_max_requests) || 30,
        videoWindowSeconds: Number(row.rate_limit_video_window_seconds) || 60,
      },
    };
  });
}

export async function updateSystemConfig(
  updates: Partial<SystemConfig>
): Promise<SystemConfig> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.soraApiKey !== undefined) {
    fields.push('sora_api_key = ?');
    values.push(updates.soraApiKey);
  }
  if (updates.soraBaseUrl !== undefined) {
    fields.push('sora_base_url = ?');
    values.push(updates.soraBaseUrl);
  }
  if (updates.soraBackendUrl !== undefined) {
    fields.push('sora_backend_url = ?');
    values.push(updates.soraBackendUrl);
  }
  if (updates.soraBackendUsername !== undefined) {
    fields.push('sora_backend_username = ?');
    values.push(updates.soraBackendUsername);
  }
  if (updates.soraBackendPassword !== undefined) {
    fields.push('sora_backend_password = ?');
    values.push(updates.soraBackendPassword);
  }
  if (updates.soraBackendToken !== undefined) {
    fields.push('sora_backend_token = ?');
    values.push(updates.soraBackendToken);
  }
  if (updates.geminiApiKey !== undefined) {
    fields.push('gemini_api_key = ?');
    values.push(updates.geminiApiKey);
  }
  if (updates.geminiBaseUrl !== undefined) {
    fields.push('gemini_base_url = ?');
    values.push(updates.geminiBaseUrl);
  }
  if (updates.zimageApiKey !== undefined) {
    fields.push('zimage_api_key = ?');
    values.push(updates.zimageApiKey);
  }
  if (updates.zimageBaseUrl !== undefined) {
    fields.push('zimage_base_url = ?');
    values.push(updates.zimageBaseUrl);
  }
  if (updates.giteeApiKey !== undefined) {
    fields.push('gitee_api_key = ?');
    values.push(updates.giteeApiKey);
  }
  if (updates.giteeFreeApiKey !== undefined) {
    fields.push('gitee_free_api_key = ?');
    values.push(updates.giteeFreeApiKey);
  }
  if (updates.giteeBaseUrl !== undefined) {
    fields.push('gitee_base_url = ?');
    values.push(updates.giteeBaseUrl);
  }
  if (updates.picuiApiKey !== undefined) {
    fields.push('picui_api_key = ?');
    values.push(updates.picuiApiKey);
  }
  if (updates.picuiBaseUrl !== undefined) {
    fields.push('picui_base_url = ?');
    values.push(updates.picuiBaseUrl);
  }
  if (updates.pricing) {
    const p = updates.pricing as Partial<PricingConfig>;
    if (p.soraVideo10s !== undefined) {
      fields.push('pricing_sora_video_10s = ?');
      values.push(p.soraVideo10s);
    }
    if (p.soraVideo15s !== undefined) {
      fields.push('pricing_sora_video_15s = ?');
      values.push(p.soraVideo15s);
    }
    if (p.soraVideo25s !== undefined) {
      fields.push('pricing_sora_video_25s = ?');
      values.push(p.soraVideo25s);
    }
    if (p.soraImage !== undefined) {
      fields.push('pricing_sora_image = ?');
      values.push(p.soraImage);
    }
    if (p.geminiNano !== undefined) {
      fields.push('pricing_gemini_nano = ?');
      values.push(p.geminiNano);
    }
    if (p.geminiPro !== undefined) {
      fields.push('pricing_gemini_pro = ?');
      values.push(p.geminiPro);
    }
    if (p.zimageImage !== undefined) {
      fields.push('pricing_zimage_image = ?');
      values.push(p.zimageImage);
    }
    if (p.giteeImage !== undefined) {
      fields.push('pricing_gitee_image = ?');
      values.push(p.giteeImage);
    }
  }
  if (updates.registerEnabled !== undefined) {
    fields.push('register_enabled = ?');
    values.push(updates.registerEnabled);
  }
  if (updates.defaultBalance !== undefined) {
    fields.push('default_balance = ?');
    values.push(updates.defaultBalance);
  }
  if (updates.featureFlags) {
    const featureFlags = updates.featureFlags;
    if (featureFlags.squareEnabled !== undefined) {
      fields.push('square_enabled = ?');
      values.push(featureFlags.squareEnabled ? 1 : 0);
    }
    if (featureFlags.gachaEnabled !== undefined) {
      fields.push('gacha_enabled = ?');
      values.push(featureFlags.gachaEnabled ? 1 : 0);
    }
    if (featureFlags.characterCardEnabled !== undefined) {
      fields.push('character_card_enabled = ?');
      values.push(featureFlags.characterCardEnabled ? 1 : 0);
    }
  }
  if (updates.inviteSettings) {
    const inviteSettings = updates.inviteSettings;
    if (inviteSettings.enabled !== undefined) {
      fields.push('invite_enabled = ?');
      values.push(inviteSettings.enabled ? 1 : 0);
    }
    if (inviteSettings.rewardEnabled !== undefined) {
      fields.push('invite_reward_enabled = ?');
      values.push(inviteSettings.rewardEnabled ? 1 : 0);
    }
    if (inviteSettings.inviteeBonusPoints !== undefined) {
      fields.push('invite_invitee_bonus = ?');
      values.push(inviteSettings.inviteeBonusPoints);
    }
    if (inviteSettings.inviterBonusPoints !== undefined) {
      fields.push('invite_inviter_bonus = ?');
      values.push(inviteSettings.inviterBonusPoints);
    }
  }
  if (updates.imageStorage) {
    const imageStorage = updates.imageStorage;
    const buckets = (imageStorage.buckets || []).map((bucket, index) =>
      sanitizeImageBucket(bucket, index)
    ).filter((bucket): bucket is ImageBucketConfig => Boolean(bucket));

    const defaultBucketId =
      typeof imageStorage.defaultBucketId === 'string'
        ? imageStorage.defaultBucketId
        : '';
    const defaultBucket =
      buckets.find((bucket) => bucket.id === defaultBucketId) ||
      buckets.find((bucket) => bucket.enabled);

    fields.push('image_storage_buckets = ?');
    values.push(JSON.stringify(buckets));
    fields.push('image_storage_default_bucket_id = ?');
    values.push(defaultBucket?.id || '');

    if (defaultBucket?.provider === 'picui') {
      fields.push('picui_base_url = ?');
      values.push(defaultBucket.baseUrl);
      fields.push('picui_api_key = ?');
      values.push(defaultBucket.apiKey);
    } else {
      fields.push('picui_base_url = ?');
      values.push('');
      fields.push('picui_api_key = ?');
      values.push('');
    }
  }
  // 公告配置
  if (updates.announcement) {
    const a = updates.announcement;
    if (a.title !== undefined) {
      fields.push('announcement_title = ?');
      values.push(a.title);
    }
    if (a.content !== undefined) {
      fields.push('announcement_content = ?');
      values.push(a.content);
    }
    if (a.enabled !== undefined) {
      fields.push('announcement_enabled = ?');
      values.push(a.enabled);
    }
    fields.push('announcement_updated_at = ?');
    values.push(Date.now());
  }
  // 渠道启用配置
  if (updates.channelEnabled) {
    const c = updates.channelEnabled;
    if (c.sora !== undefined) {
      fields.push('channel_sora_enabled = ?');
      values.push(c.sora ? 1 : 0);
    }
    if (c.gemini !== undefined) {
      fields.push('channel_gemini_enabled = ?');
      values.push(c.gemini ? 1 : 0);
    }
    if (c.zimage !== undefined) {
      fields.push('channel_zimage_enabled = ?');
      values.push(c.zimage ? 1 : 0);
    }
    if (c.gitee !== undefined) {
      fields.push('channel_gitee_enabled = ?');
      values.push(c.gitee ? 1 : 0);
    }
  }
  // 每日请求限制配置
  if (updates.dailyLimit) {
    const d = updates.dailyLimit;
    if (d.imageLimit !== undefined) {
      fields.push('daily_limit_image = ?');
      values.push(d.imageLimit);
    }
    if (d.videoLimit !== undefined) {
      fields.push('daily_limit_video = ?');
      values.push(d.videoLimit);
    }
    if (d.characterCardLimit !== undefined) {
      fields.push('daily_limit_character_card = ?');
      values.push(d.characterCardLimit);
    }
  }
  // 网站配置
  if (updates.siteConfig) {
    const s = updates.siteConfig;
    if (s.siteName !== undefined) {
      fields.push('site_name = ?');
      values.push(s.siteName);
    }
    if (s.siteTagline !== undefined) {
      fields.push('site_tagline = ?');
      values.push(s.siteTagline);
    }
    if (s.siteDescription !== undefined) {
      fields.push('site_description = ?');
      values.push(s.siteDescription);
    }
    if (s.siteSubDescription !== undefined) {
      fields.push('site_sub_description = ?');
      values.push(s.siteSubDescription);
    }
    if (s.contactEmail !== undefined) {
      fields.push('contact_email = ?');
      values.push(s.contactEmail);
    }
    if (s.copyright !== undefined) {
      fields.push('site_copyright = ?');
      values.push(s.copyright);
    }
    if (s.poweredBy !== undefined) {
      fields.push('site_powered_by = ?');
      values.push(s.poweredBy);
    }
  }
  // 模型禁用配置
  if (updates.disabledModels) {
    const d = updates.disabledModels;
    if (d.imageModels !== undefined) {
      fields.push('disabled_image_models = ?');
      values.push(JSON.stringify(d.imageModels));
    }
    if (d.videoModels !== undefined) {
      fields.push('disabled_video_models = ?');
      values.push(JSON.stringify(d.videoModels));
    }
  }
  // 视频加速配置
  if (updates.videoProxyEnabled !== undefined) {
    fields.push('video_proxy_enabled = ?');
    values.push(updates.videoProxyEnabled ? 1 : 0);
  }
  if (updates.videoProxyBaseUrl !== undefined) {
    fields.push('video_proxy_base_url = ?');
    values.push(updates.videoProxyBaseUrl);
  }

  // 提示词处理配置
  if (updates.promptProcessing) {
    const p = updates.promptProcessing;
    if (p.filterEnabled !== undefined) {
      fields.push('prompt_filter_enabled = ?');
      values.push(p.filterEnabled ? 1 : 0);
    }
    if (p.filterModelId !== undefined) {
      fields.push('prompt_filter_model_id = ?');
      values.push(p.filterModelId);
    }
    if (p.filterPrompt !== undefined) {
      fields.push('prompt_filter_prompt = ?');
      values.push(p.filterPrompt);
    }
    if (p.translateEnabled !== undefined) {
      fields.push('prompt_translate_enabled = ?');
      values.push(p.translateEnabled ? 1 : 0);
    }
    if (p.translateModelId !== undefined) {
      fields.push('prompt_translate_model_id = ?');
      values.push(p.translateModelId);
    }
    if (p.translatePrompt !== undefined) {
      fields.push('prompt_translate_prompt = ?');
      values.push(p.translatePrompt);
    }

    if (p.blocklistEnabled !== undefined) {
      fields.push('prompt_blocklist_enabled = ?');
      values.push(p.blocklistEnabled ? 1 : 0);
    }

    if (p.blocklistWords !== undefined) {
      fields.push('prompt_blocklist_words = ?');
      values.push(p.blocklistWords);
    }
  }

  // 生成限流配置
  if (updates.rateLimit) {
    const r = updates.rateLimit;
    if (r.imageMaxRequests !== undefined) {
      fields.push('rate_limit_image_max_requests = ?');
      values.push(r.imageMaxRequests);
    }
    if (r.imageWindowSeconds !== undefined) {
      fields.push('rate_limit_image_window_seconds = ?');
      values.push(r.imageWindowSeconds);
    }
    if (r.videoMaxRequests !== undefined) {
      fields.push('rate_limit_video_max_requests = ?');
      values.push(r.videoMaxRequests);
    }
    if (r.videoWindowSeconds !== undefined) {
      fields.push('rate_limit_video_window_seconds = ?');
      values.push(r.videoWindowSeconds);
    }
  }

  if (fields.length > 0) {
    await db.execute(
      `UPDATE system_config SET ${fields.join(', ')} WHERE id = 1`,
      values
    );
    cache.delete(CacheKeys.SYSTEM_CONFIG);
  }

  return getSystemConfig();
}
