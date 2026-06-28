/* eslint-disable no-console */
import { getAdapter } from './connection';
import type { DatabaseAdapter } from '../db-adapter';
import bcrypt from 'bcryptjs';
import { generateId } from '../utils';

// ========================================
// 数据库初始化
// ========================================

const CREATE_TABLES_SQL = `
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(191) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('user', 'admin', 'moderator') DEFAULT 'user',
  balance INT DEFAULT 100,
  disabled TINYINT(1) DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_email (email)
);

-- 生成记录表
CREATE TABLE IF NOT EXISTS generations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type ENUM('sora-video', 'sora-image', 'gemini-image', 'zimage-image', 'gitee-image') NOT NULL,
  prompt TEXT,
  params TEXT,
  result_url LONGTEXT,
  cost INT DEFAULT 0,
  balance_precharged TINYINT(1) DEFAULT 0,
  balance_refunded TINYINT(1) DEFAULT 0,
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  id INT PRIMARY KEY DEFAULT 1,
  sora_api_key VARCHAR(500) DEFAULT '',
  sora_base_url VARCHAR(500) DEFAULT 'http://localhost:8000',
  gemini_api_key VARCHAR(500) DEFAULT '',
  gemini_base_url VARCHAR(500) DEFAULT 'https://generativelanguage.googleapis.com',
  zimage_api_key VARCHAR(500) DEFAULT '',
  zimage_base_url VARCHAR(500) DEFAULT 'https://api-inference.modelscope.cn/',
  gitee_api_key TEXT,
  gitee_free_api_key TEXT,
  gitee_base_url VARCHAR(500) DEFAULT 'https://ai.gitee.com/',
  picui_api_key VARCHAR(500) DEFAULT '',
  picui_base_url VARCHAR(500) DEFAULT 'https://picui.cn/api/v1',
  square_enabled TINYINT(1) DEFAULT 1,
  gacha_enabled TINYINT(1) DEFAULT 1,
  character_card_enabled TINYINT(1) DEFAULT 1,
  invite_enabled TINYINT(1) DEFAULT 1,
  invite_reward_enabled TINYINT(1) DEFAULT 1,
  invite_invitee_bonus INT DEFAULT 100,
  invite_inviter_bonus INT DEFAULT 50,
  image_storage_buckets LONGTEXT,
  image_storage_default_bucket_id VARCHAR(64) DEFAULT '',
  sora_backend_url VARCHAR(500) DEFAULT '',
  sora_backend_username VARCHAR(100) DEFAULT '',
  sora_backend_password VARCHAR(100) DEFAULT '',
  sora_backend_token VARCHAR(500) DEFAULT '',
  pricing_sora_video_10s INT DEFAULT 100,
  pricing_sora_video_15s INT DEFAULT 150,
  pricing_sora_video_25s INT DEFAULT 200,
  pricing_sora_image INT DEFAULT 50,
  pricing_gemini_nano INT DEFAULT 10,
  pricing_gemini_pro INT DEFAULT 30,
  pricing_zimage_image INT DEFAULT 30,
  pricing_gitee_image INT DEFAULT 30,
  pricing_chat INT DEFAULT 1,
  register_enabled TINYINT(1) DEFAULT 1,
  default_balance INT DEFAULT 100,
  prompt_filter_enabled TINYINT(1) DEFAULT 0,
  prompt_filter_model_id VARCHAR(36) DEFAULT '',
  prompt_filter_prompt TEXT,
  prompt_translate_enabled TINYINT(1) DEFAULT 0,
  prompt_translate_model_id VARCHAR(36) DEFAULT '',
  prompt_translate_prompt TEXT,
  prompt_blocklist_enabled TINYINT(1) DEFAULT 0,
  prompt_blocklist_words TEXT,
  rate_limit_image_max_requests INT DEFAULT 30,
  rate_limit_image_window_seconds INT DEFAULT 60,
  rate_limit_video_max_requests INT DEFAULT 30,
  rate_limit_video_window_seconds INT DEFAULT 60
);

-- 聊天模型表
CREATE TABLE IF NOT EXISTS chat_models (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  api_url VARCHAR(500) NOT NULL,
  api_key VARCHAR(500) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  supports_vision TINYINT(1) DEFAULT 0,
  max_tokens INT DEFAULT 128000,
  enabled TINYINT(1) DEFAULT 1,
  cost_per_message INT DEFAULT 1,
  created_at BIGINT NOT NULL,
  INDEX idx_enabled (enabled)
);

-- 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) DEFAULT '新对话',
  model_id VARCHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_updated_at (updated_at)
);

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content LONGTEXT NOT NULL,
  images TEXT,
  token_count INT DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at)
);

-- 角色卡表
CREATE TABLE IF NOT EXISTS character_cards (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  character_name VARCHAR(200) DEFAULT '',
  avatar_url LONGTEXT,
  source_video_url TEXT,
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  data LONGTEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_updated_at (updated_at),
  INDEX idx_name (name)
);
`;

// 创建图像渠道表（在 initializeDatabase 中调用）
const CREATE_IMAGE_CHANNELS_SQL = `
CREATE TABLE IF NOT EXISTS image_channels (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  base_url VARCHAR(500) DEFAULT '',
  api_key TEXT,
  enabled TINYINT(1) DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_enabled (enabled),
  INDEX idx_type (type)
);

CREATE TABLE IF NOT EXISTS image_models (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT '',
  api_model VARCHAR(200) NOT NULL,
  base_url VARCHAR(500) DEFAULT '',
  api_key TEXT,
  features TEXT NOT NULL,
  aspect_ratios TEXT NOT NULL,
  resolutions TEXT NOT NULL,
  image_sizes TEXT,
  default_aspect_ratio VARCHAR(20) DEFAULT '1:1',
  default_image_size VARCHAR(20),
  requires_reference_image TINYINT(1) DEFAULT 0,
  allow_empty_prompt TINYINT(1) DEFAULT 0,
  highlight TINYINT(1) DEFAULT 0,
  enabled TINYINT(1) DEFAULT 1,
  cost_per_generation INT DEFAULT 10,
  sort_order INT DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_channel_id (channel_id),
  INDEX idx_enabled (enabled),
  INDEX idx_sort_order (sort_order)
);
`;

// 创建视频渠道表
const CREATE_VIDEO_CHANNELS_SQL = `
CREATE TABLE IF NOT EXISTS video_channels (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  base_url VARCHAR(500) DEFAULT '',
  api_key TEXT,
  enabled TINYINT(1) DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_enabled (enabled)
);

CREATE TABLE IF NOT EXISTS video_models (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT '',
  api_model VARCHAR(200) NOT NULL,
  base_url VARCHAR(500) DEFAULT '',
  api_key TEXT,
  features TEXT NOT NULL,
  aspect_ratios TEXT NOT NULL,
  durations TEXT NOT NULL,
  default_aspect_ratio VARCHAR(20) DEFAULT 'landscape',
  default_duration VARCHAR(20) DEFAULT '8s',
  video_config_object TEXT,
  highlight TINYINT(1) DEFAULT 0,
  enabled TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_channel_id (channel_id),
  INDEX idx_enabled (enabled)
);
`;

let initialized = false;

export async function initializeDatabase(): Promise<void> {
  const db = getAdapter();

  // 渠道表始终尝试创建（幂等操作，确保新表被创建）
  await initializeImageChannelsTablesInternal(db);
  await initializeVideoChannelsTablesInternal(db);

  if (initialized) return;

  const statements = CREATE_TABLES_SQL.split(';').filter((s) => s.trim());

  for (const statement of statements) {
    if (statement.trim()) {
      await db.execute(statement);
    }
  }

  const dbType = process.env.DB_TYPE || 'sqlite';

  // 迁移：确保 avatar_url 列是 LONGTEXT（仅 MySQL 需要，SQLite 不支持 MODIFY COLUMN）
  if (dbType === 'mysql') {
    try {
      await db.execute(`
        ALTER TABLE character_cards MODIFY COLUMN avatar_url LONGTEXT
      `);
    } catch (e) {
      // 忽略错误（列可能已经是正确类型或表不存在）
    }
  }

  // 初始化系统配置（如果不存在）
  const [configRows] = await db.execute('SELECT id FROM system_config WHERE id = 1');
  if ((configRows as unknown[]).length === 0) {
    await db.execute(`
      INSERT INTO system_config (id, sora_api_key, sora_base_url, gemini_api_key, gemini_base_url)
      VALUES (1, ?, ?, ?, ?)
    `, [
      process.env.SORA_API_KEY || '',
      process.env.SORA_BASE_URL || 'http://localhost:8000',
      process.env.GEMINI_API_KEY || '',
      process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    ]);
  }

  // 初始化管理员账号
  await initializeAdmin();

  // 添加 disabled 字段（如果不存在）
  try {
    await db.execute('ALTER TABLE users ADD COLUMN disabled BOOLEAN DEFAULT FALSE');
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加 generations 表的新字段（如果不存在）
  try {
    if (dbType === 'mysql') {
      await db.execute("ALTER TABLE generations ADD COLUMN status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending'");
    } else {
      // SQLite: ENUM 转为 TEXT
      await db.execute("ALTER TABLE generations ADD COLUMN status TEXT DEFAULT 'pending'");
    }
  } catch {
    // 字段已存在，忽略错误
  }

  try {
    await db.execute('ALTER TABLE generations ADD COLUMN error_message TEXT');
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加余额预扣/退款标记字段（如果不存在）
  try {
    await db.execute('ALTER TABLE generations ADD COLUMN balance_precharged TINYINT(1) DEFAULT 0');
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute('ALTER TABLE generations ADD COLUMN balance_refunded TINYINT(1) DEFAULT 0');
  } catch {
    // 字段已存在，忽略错误
  }

  // 确保 generations.params 列存在（用于存储 permalink / revised_prompt 等扩展信息）
  try {
    if (dbType === 'mysql') {
      await db.execute('ALTER TABLE generations ADD COLUMN params TEXT');
    } else {
      await db.execute('ALTER TABLE generations ADD COLUMN params TEXT');
    }
  } catch {
    // 字段已存在，忽略错误
  }

  try {
    if (dbType === 'mysql') {
      await db.execute('ALTER TABLE generations ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0');
    } else {
      // SQLite: 不支持 NOT NULL 和 DEFAULT 同时使用在 ALTER TABLE 中
      await db.execute('ALTER TABLE generations ADD COLUMN updated_at INTEGER DEFAULT 0');
    }
  } catch {
    // 字段已存在，忽略错误
  }

  // 为已存在的记录设置默认值
  try {
    await db.execute("UPDATE generations SET status = 'completed' WHERE status IS NULL OR status = ''");
    await db.execute('UPDATE generations SET updated_at = created_at WHERE updated_at = 0 OR updated_at IS NULL');
    await db.execute("UPDATE generations SET params = '{}' WHERE params IS NULL OR params = ''");
  } catch {
    // 忽略错误
  }

  // 添加 Z-Image 配置字段（如果不存在）
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN zimage_api_key VARCHAR(500) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN zimage_base_url VARCHAR(500) DEFAULT 'https://api-inference.modelscope.cn/'");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute('ALTER TABLE system_config ADD COLUMN pricing_zimage_image INT DEFAULT 30');
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加 Gitee 配置字段（如果不存在）
  try {
    await db.execute('ALTER TABLE system_config ADD COLUMN gitee_api_key TEXT');
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute('ALTER TABLE system_config ADD COLUMN gitee_free_api_key TEXT');
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN gitee_base_url VARCHAR(500) DEFAULT 'https://ai.gitee.com/'");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute('ALTER TABLE system_config ADD COLUMN pricing_gitee_image INT DEFAULT 30');
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加 25s 视频定价字段
  try {
    await db.execute('ALTER TABLE system_config ADD COLUMN pricing_sora_video_25s INT DEFAULT 200');
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加 SORA 后台配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN sora_backend_url VARCHAR(500) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN sora_backend_username VARCHAR(100) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN sora_backend_password VARCHAR(100) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN sora_backend_token VARCHAR(500) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加公告配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN announcement_title VARCHAR(200) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN announcement_content TEXT");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN announcement_enabled TINYINT(1) DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN announcement_updated_at BIGINT DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加 PicUI 图床配置字段（如果不存在）
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN picui_api_key VARCHAR(500) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN picui_base_url VARCHAR(500) DEFAULT 'https://picui.cn/api/v1'");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加功能开关与邀请码配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN square_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN gacha_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN character_card_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN invite_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN invite_reward_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN invite_invitee_bonus INT DEFAULT 100");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN invite_inviter_bonus INT DEFAULT 50");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN image_storage_buckets LONGTEXT");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN image_storage_default_bucket_id VARCHAR(64) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加渠道启用配置字段（如果不存在）
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN channel_sora_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN channel_gemini_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN channel_zimage_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN channel_gitee_enabled TINYINT(1) DEFAULT 1");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加每日请求限制配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN daily_limit_image INT DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN daily_limit_video INT DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN daily_limit_character_card INT DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加网站配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN site_name VARCHAR(100) DEFAULT 'SANHUB'");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN site_tagline VARCHAR(200) DEFAULT 'Let Imagination Come Alive'");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN site_description TEXT");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN site_sub_description TEXT");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN contact_email VARCHAR(200) DEFAULT 'support@sanhub.com'");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN site_copyright VARCHAR(200) DEFAULT 'Copyright © 2025 SANHUB'");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN site_powered_by VARCHAR(200) DEFAULT 'Powered by OpenAI Sora & Google Gemini'");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加模型禁用配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN disabled_image_models TEXT");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN disabled_video_models TEXT");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加视频加速配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN video_proxy_enabled TINYINT(1) DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN video_proxy_base_url VARCHAR(500) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加提示词处理配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_filter_enabled TINYINT(1) DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_filter_model_id VARCHAR(36) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_filter_prompt TEXT");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_translate_enabled TINYINT(1) DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_translate_model_id VARCHAR(36) DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_translate_prompt TEXT");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加提示词敏感词拦截配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_blocklist_enabled TINYINT(1) DEFAULT 0");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN prompt_blocklist_words TEXT");
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加生成限流配置字段
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN rate_limit_image_max_requests INT DEFAULT 30");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN rate_limit_image_window_seconds INT DEFAULT 60");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN rate_limit_video_max_requests INT DEFAULT 30");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN rate_limit_video_window_seconds INT DEFAULT 60");
  } catch {
    // 字段已存在，忽略错误
  }

  // 更新 generations 表的 type 字段以支持 gitee-image（MySQL 需要修改 ENUM）
  if (dbType === 'mysql') {
    try {
      await db.execute("ALTER TABLE generations MODIFY COLUMN type ENUM('sora-video', 'sora-image', 'gemini-image', 'zimage-image', 'gitee-image') NOT NULL");
    } catch {
      // 忽略错误
    }
  }

  // 更新 generations 表的 status 字段以支持 cancelled（MySQL 需要修改 ENUM）
  if (dbType === 'mysql') {
    try {
      await db.execute("ALTER TABLE generations MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending'");
    } catch {
      // 忽略错误
    }
  }

  // 更新 users 表的 role 字段以支持 moderator（MySQL 需要修改 ENUM）
  if (dbType === 'mysql') {
    try {
      await db.execute("ALTER TABLE users MODIFY COLUMN role ENUM('user', 'admin', 'moderator') DEFAULT 'user'");
    } catch {
      // 忽略错误
    }
  }

  initialized = true;
  console.log('Database initialized successfully');
}

// ========================================
// 初始化管理员
// ========================================

export async function initializeAdmin(): Promise<void> {
  const db = getAdapter();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sanhub.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const [existing] = await db.execute(
    'SELECT id FROM users WHERE email = ?',
    [adminEmail]
  );

  if ((existing as unknown[]).length === 0) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const now = Date.now();

    await db.execute(
      `INSERT INTO users (id, email, password, name, role, balance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), adminEmail, hashedPassword, 'Admin', 'admin', 999999, now, now]
    );
    console.log('Admin account created:', adminEmail);
  }
}

// 内部初始化函数（供 initializeDatabase 调用，避免循环依赖）
async function initializeImageChannelsTablesInternal(db: DatabaseAdapter): Promise<void> {
  const statements = CREATE_IMAGE_CHANNELS_SQL.split(';').filter((s) => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await db.execute(statement);
      } catch (e: any) {
        // 仅忽略"表已存在"错误，其他错误需要打印
        if (e?.code !== 'ER_TABLE_EXISTS_ERROR' && e?.errno !== 1050) {
          console.error('[DB] Failed to create image channels table:', e?.message || e);
        }
      }
    }
  }
}

// 初始化图像渠道和模型表
export async function initializeImageChannelsTables(): Promise<void> {
  await initializeDatabase();
  const db = getAdapter();
  await initializeImageChannelsTablesInternal(db);
}

// 内部初始化函数（供 initializeDatabase 调用，避免循环依赖）
async function initializeVideoChannelsTablesInternal(db: DatabaseAdapter): Promise<void> {
  const statements = CREATE_VIDEO_CHANNELS_SQL.split(';').filter((s) => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await db.execute(statement);
      } catch (e: any) {
        // 仅忽略"表已存在"错误，其他错误需要打印
        if (e?.code !== 'ER_TABLE_EXISTS_ERROR' && e?.errno !== 1050) {
          console.error('[DB] Failed to create video channels table:', e?.message || e);
        }
      }
    }
  }

  try {
    await db.execute('ALTER TABLE video_models ADD COLUMN video_config_object TEXT');
  } catch {
    // ignore duplicate/missing-table errors
  }
}

// 初始化视频渠道表
export async function initializeVideoChannelsTables(): Promise<void> {
  await initializeDatabase();
  const db = getAdapter();
  await initializeVideoChannelsTablesInternal(db);
}
