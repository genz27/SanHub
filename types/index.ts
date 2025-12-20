// ========================================
// SanHub 类型定义
// ========================================

// 用户角色
// admin: 超级管理员，拥有所有权限
// moderator: 小管理员，只能管理用户（积分、密码、禁用），不能修改超级管理员
// user: 普通用户
export type UserRole = 'user' | 'admin' | 'moderator';

// 生成类型
export type GenerationType = 'sora-video' | 'sora-image' | 'gemini-image' | 'zimage-image' | 'gitee-image' | 'chat' | 'character-card';

// 聊天模型配置
export interface ChatModel {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  modelId: string;
  supportsVision: boolean;
  maxTokens: number;
  enabled: boolean;
  costPerMessage: number;
  createdAt: number;
}

// 聊天会话
export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

// 聊天消息
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // base64 图片
  tokenCount: number;
  createdAt: number;
}

// 用户模型
export interface User {
  id: string;
  email: string;
  password: string; // bcrypt hashed
  name: string;
  role: UserRole;
  balance: number; // 积分余额
  disabled: boolean; // 是否禁用
  createdAt: number;
  updatedAt: number;
}

// 用户 (不含密码，用于前端)
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  balance: number;
  disabled: boolean;
  createdAt: number;
}

// 生成记录
export interface Generation {
  id: string;
  userId: string;
  type: GenerationType;
  prompt: string;
  params: GenerationParams;
  resultUrl: string; // base64 data URL 或外链
  cost: number; // 消耗积分
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

// 生成参数
export interface GenerationParams {
  model?: string;
  aspectRatio?: string;
  duration?: string;
  imageSize?: string;
  size?: string; // Z-Image 分辨率
  referenceImages?: string[]; // base64 数组
  loras?: string | Record<string, number>; // Z-Image LoRA 配置
  channel?: 'modelscope' | 'gitee'; // Z-Image 渠道
  imageCount?: number; // 参考图数量
  permalink?: string;
  revised_prompt?: string;
}

// SORA 后台配置
export interface SoraBackendConfig {
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string; // admin login token
}

// SORA 统计数据
export interface SoraStats {
  total_tokens: number;
  active_tokens: number;
  total_images: number;
  total_videos: number;
  today_images: number;
  today_videos: number;
  total_errors: number;
  today_errors: number;
}

// 公告配置
export interface AnnouncementConfig {
  title: string;
  content: string; // 支持 HTML
  enabled: boolean;
  updatedAt: number;
}

// 系统配置
export interface SystemConfig {
  soraApiKey: string;
  soraBaseUrl: string;
  // SORA 后台配置
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string;
  geminiApiKey: string;
  geminiBaseUrl: string;
  zimageApiKey: string;
  zimageBaseUrl: string;
  giteeFreeApiKey: string;
  giteeApiKey: string; // 支持多key，用逗号分隔
  giteeBaseUrl: string;
  // PicUI 图床配置
  picuiApiKey: string;
  picuiBaseUrl: string;
  pricing: PricingConfig;
  registerEnabled: boolean;
  defaultBalance: number;
  // 公告配置
  announcement: AnnouncementConfig;
}

// 定价配置
export interface PricingConfig {
  soraVideo10s: number;
  soraVideo15s: number;
  soraImage: number;
  geminiNano: number;
  geminiPro: number;
  zimageImage: number;
  giteeImage: number;
}

// API 响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Sora 生成请求
export interface SoraGenerateRequest {
  prompt: string;
  model: string; // sora-video-landscape-10s, sora-image 等
  files?: { mimeType: string; data: string }[];
  referenceImageUrl?: string;
  style_id?: string; // 风格: festive, retro, news, selfie, handheld, anime, comic, golden, vintage
  remix_target_id?: string; // Remix 视频 ID
}

// Gemini 生成请求
export interface GeminiGenerateRequest {
  prompt: string;
  model: string; // gemini-2.5-flash-image, gemini-3-pro-image-preview
  aspectRatio: string;
  imageSize?: string;
  images?: { mimeType: string; data: string }[];
  referenceImageUrl?: string;
}

// Z-Image 生成请求
export interface ZImageGenerateRequest {
  prompt: string;
  model?: string; // 默认 Tongyi-MAI/Z-Image-Turbo
  size?: string; // 分辨率，如 1024x1024
  loras?: string | Record<string, number>; // 单个 LoRA 或多个 LoRA 配置
  images?: { mimeType: string; data: string }[]; // 参考图（base64 数据）
  channel?: 'modelscope' | 'gitee'; // 渠道选择
  numInferenceSteps?: number; // Gitee 推理步数
  outscale?: number; // 超分倍率
  outputFormat?: string; // 输出格式
  referenceImageUrl?: string;
}

// 生成结果
export interface GenerateResult {
  type: GenerationType;
  url: string;
  cost: number;
  permalink?: string;
  revised_prompt?: string;
}

// NextAuth 扩展
declare module 'next-auth' {
  interface Session {
    user: SafeUser;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    balance: number;
  }
}

// 角色卡
export interface CharacterCard {
  id: string;
  userId: string;
  characterName: string; // 角色名称 (如 @lotuswhisp719)
  avatarUrl: string; // 角色头像 URL
  sourceVideoUrl?: string; // 源视频 URL (可选)
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

// ========================================
// Workspace types
// ========================================

export type WorkspaceNodeType = 'image' | 'video';

export interface WorkspaceNode {
  id: string;
  type: WorkspaceNodeType;
  name: string;
  position: { x: number; y: number };
  data: {
    modelId: string;
    aspectRatio?: string;
    duration?: string;
    imageSize?: string;
    prompt: string;
    outputUrl?: string;
    outputType?: 'image' | 'video';
    generationId?: string;
    revisedPrompt?: string;
    status?: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
  };
}

export interface WorkspaceEdge {
  id: string;
  from: string;
  to: string;
}

export interface WorkspaceData {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  data: WorkspaceData;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}


