import type { User, Generation, SystemConfig, SafeUser, PricingConfig, ChatModel, ChatSession, ChatMessage, CharacterCard, Workspace, WorkspaceData, WorkspaceSummary } from '@/types';
import { generateId } from './utils';
import bcrypt from 'bcryptjs';
import { createDatabaseAdapter, type DatabaseAdapter } from './db-adapter';
import { cache, CacheKeys, CacheTTL, withCache } from './cache';

// ========================================
// 数据库连接（支持 SQLite �?MySQL�?
// ========================================

let adapter: DatabaseAdapter | null = null;

function getAdapter(): DatabaseAdapter {
  if (!adapter) {
    adapter = createDatabaseAdapter();
    console.log(`[DB] 使用数据库类�? ${process.env.DB_TYPE || 'sqlite'}`);
  }
  return adapter;
}

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
  default_balance INT DEFAULT 100
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

let initialized = false;

export async function initializeDatabase(): Promise<void> {
  if (initialized) return;

  const db = getAdapter();
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

  // 添加 disabled 字段（如果不存在�?
  try {
    await db.execute('ALTER TABLE users ADD COLUMN disabled BOOLEAN DEFAULT FALSE');
  } catch {
    // 字段已存在，忽略错误
  }

  // 添加 generations 表的新字段（如果不存在）
  try {
    if (dbType === 'mysql') {
      await db.execute('ALTER TABLE generations ADD COLUMN status ENUM("pending", "processing", "completed", "failed") DEFAULT "pending"');
    } else {
      // SQLite: ENUM 转为 TEXT
      await db.execute('ALTER TABLE generations ADD COLUMN status TEXT DEFAULT "pending"');
    }
  } catch {
    // 字段已存在，忽略错误
  }

  try {
    await db.execute('ALTER TABLE generations ADD COLUMN error_message TEXT');
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
    await db.execute('UPDATE generations SET status = "completed" WHERE status IS NULL OR status = ""');
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
    await db.execute("ALTER TABLE system_config ADD COLUMN gitee_api_key TEXT DEFAULT ''");
  } catch {
    // 字段已存在，忽略错误
  }
  try {
    await db.execute("ALTER TABLE system_config ADD COLUMN gitee_free_api_key TEXT DEFAULT ''");
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
// 用户操作
// ========================================

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: 'user' | 'admin' = 'user',
  balance?: number
): Promise<User> {
  await initializeDatabase();
  const db = getAdapter();

  // 检查邮箱是否已存在
  const [existing] = await db.execute(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );
  if ((existing as unknown[]).length > 0) {
    throw new Error('该邮箱已被注册');
  }

  const config = await getSystemConfig();
  const hashedPassword = await bcrypt.hash(password, 10);
  const now = Date.now();

  const user: User = {
    id: generateId(),
    email,
    password: hashedPassword,
    name,
    role,
    balance: balance ?? config.defaultBalance,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO users (id, email, password, name, role, balance, disabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.email, user.password, user.name, user.role, user.balance, user.disabled, user.createdAt, user.updatedAt]
  );

  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM users WHERE id = ?',
    [id]
  );

  const users = rows as any[];
  if (users.length === 0) return null;

  const row = users[0];
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );

  const users = rows as any[];
  if (users.length === 0) return null;

  const row = users[0];
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  // 禁用用户不能登录
  if (user.disabled) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return user;
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'email' | 'createdAt'>>
): Promise<User | null> {
  await initializeDatabase();
  const db = getAdapter();

  const user = await getUserById(id);
  if (!user) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.password !== undefined) {
    fields.push('password = ?');
    values.push(await bcrypt.hash(updates.password, 10));
  }
  if (updates.role !== undefined) {
    fields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.balance !== undefined) {
    fields.push('balance = ?');
    values.push(updates.balance);
  }
  if (updates.disabled !== undefined) {
    fields.push('disabled = ?');
    values.push(updates.disabled);
  }

  if (fields.length === 0) return user;

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  await db.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return getUserById(id);
}

export async function updateUserBalance(id: string, delta: number): Promise<number> {
  await initializeDatabase();
  const db = getAdapter();

  const user = await getUserById(id);
  if (!user) throw new Error('用户不存在');

  const newBalance = Math.max(0, user.balance + delta);
  await db.execute(
    'UPDATE users SET balance = ?, updated_at = ? WHERE id = ?',
    [newBalance, Date.now(), id]
  );

  return newBalance;
}

export async function getAllUsers(options: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<SafeUser[]> {
  await initializeDatabase();
  const db = getAdapter();
  const limit = Math.max(options.limit ?? 200, 1);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = options.search?.trim();

  let sql = 'SELECT id, email, name, role, balance, disabled, created_at FROM users';
  const params: unknown[] = [];

  if (search) {
    sql += ' WHERE email LIKE ? OR name LIKE ?';
    const term = `%${search}%`;
    params.push(term, term);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await db.execute(sql, params);

  return (rows as any[]).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    balance: row.balance,
    disabled: Boolean(row.disabled),
    createdAt: Number(row.created_at),
  }));
}

export async function getUsersCount(search?: string): Promise<number> {
  await initializeDatabase();
  const db = getAdapter();
  const term = search?.trim();

  let sql = 'SELECT COUNT(1) as count FROM users';
  const params: unknown[] = [];

  if (term) {
    sql += ' WHERE email LIKE ? OR name LIKE ?';
    const like = `%${term}%`;
    params.push(like, like);
  }

  const [rows] = await db.execute(sql, params);
  const row = (rows as any[])[0];
  return Number(row?.count || 0);
}

export async function deleteUser(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// 生成记录操作
// ========================================

export async function saveGeneration(
  generation: Omit<Generation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Generation> {
  await initializeDatabase();
  const db = getAdapter();

  const now = Date.now();
  const gen: Generation = {
    ...generation,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO generations (id, user_id, type, prompt, params, result_url, cost, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      gen.id,
      gen.userId,
      gen.type,
      gen.prompt,
      JSON.stringify(gen.params),
      gen.resultUrl,
      gen.cost,
      gen.status,
      gen.errorMessage || null,
      gen.createdAt,
      gen.updatedAt,
    ]
  );

  return gen;
}

export async function updateGeneration(
  id: string,
  updates: Partial<Pick<Generation, 'status' | 'resultUrl' | 'errorMessage' | 'params'>>
): Promise<Generation | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.resultUrl !== undefined) {
    fields.push('result_url = ?');
    values.push(updates.resultUrl);
  }
  if (updates.params !== undefined) {
    fields.push('params = ?');
    values.push(JSON.stringify(updates.params));
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  values.push(id);
  await db.execute(
    `UPDATE generations SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return getGeneration(id);
}

export async function getUserGenerations(
  userId: string,
  limit = 50,
  offset = 0
): Promise<Generation[]> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

// 获取用户正在进行的任务（pending 或 processing）
export async function getPendingGenerations(userId: string, limit = 50): Promise<Generation[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(limit, 1);

  const [rows] = await db.execute(
    `SELECT * FROM generations WHERE user_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT ?`,
    [userId, safeLimit]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status,
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function getGeneration(id: string): Promise<Generation | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM generations WHERE id = ?', [id]);
  const gens = rows as any[];
  if (gens.length === 0) return null;

  const row = gens[0];
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    prompt: row.prompt,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
    resultUrl: row.result_url,
    cost: row.cost,
    status: row.status || 'completed',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  };
}

// 删除单个生成记录
export async function deleteGeneration(id: string, userId: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM generations WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return (result as any).affectedRows > 0;
}

// 批量删除生成记录
export async function deleteGenerations(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  
  await initializeDatabase();
  const db = getAdapter();

  const placeholders = ids.map(() => '?').join(',');
  const [result] = await db.execute(
    `DELETE FROM generations WHERE id IN (${placeholders}) AND user_id = ?`,
    [...ids, userId]
  );

  return (result as any).affectedRows || 0;
}

// 清空用户所有已完成的生成记录
export async function deleteAllUserGenerations(userId: string): Promise<number> {
  await initializeDatabase();
  const db = getAdapter();

  // 只删除已完成或失败的，保留进行中的任务
  const [result] = await db.execute(
    `DELETE FROM generations WHERE user_id = ? AND status NOT IN ('pending', 'processing')`,
    [userId]
  );

  return (result as any).affectedRows || 0;
}

// 获取用户今日使用量统计
export interface DailyUsageStats {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

export async function getUserDailyUsage(userId: string): Promise<DailyUsageStats> {
  await initializeDatabase();
  const db = getAdapter();

  // 获取今天 0 点的时间戳
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 统计今日图像生成数量（包括 pending/processing/completed）
  const [imageRows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations 
     WHERE user_id = ? AND created_at >= ? 
     AND type IN ('sora-image', 'gemini-image', 'zimage-image', 'gitee-image')
     AND status != 'cancelled'`,
    [userId, todayStart]
  );
  const imageCount = Number((imageRows as any[])[0]?.count || 0);

  // 统计今日视频生成数量
  const [videoRows] = await db.execute(
    `SELECT COUNT(1) as count FROM generations 
     WHERE user_id = ? AND created_at >= ? 
     AND type = 'sora-video'
     AND status != 'cancelled'`,
    [userId, todayStart]
  );
  const videoCount = Number((videoRows as any[])[0]?.count || 0);

  // 统计今日角色卡生成数量
  const [cardRows] = await db.execute(
    `SELECT COUNT(1) as count FROM character_cards 
     WHERE user_id = ? AND created_at >= ?
     AND status != 'cancelled'`,
    [userId, todayStart]
  );
  const characterCardCount = Number((cardRows as any[])[0]?.count || 0);

  return { imageCount, videoCount, characterCardCount };
}

// ========================================
// 系统配置操作
// ========================================

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
      };
    }

    const row = configs[0];
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

  if (fields.length > 0) {
    await db.execute(
      `UPDATE system_config SET ${fields.join(', ')} WHERE id = 1`,
      values
    );
    cache.delete(CacheKeys.SYSTEM_CONFIG);
  }

  return getSystemConfig();
}

// ========================================
// 初始化管理员
// ========================================

async function initializeAdmin(): Promise<void> {
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

// ========================================
// 聊天模型操作
// ========================================

export async function getChatModels(enabledOnly = false): Promise<ChatModel[]> {
  await initializeDatabase();
  const db = getAdapter();

  const sql = enabledOnly
    ? 'SELECT * FROM chat_models WHERE enabled = TRUE ORDER BY created_at ASC'
    : 'SELECT * FROM chat_models ORDER BY created_at ASC';

  const [rows] = await db.execute(sql);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    modelId: row.model_id,
    supportsVision: Boolean(row.supports_vision),
    maxTokens: row.max_tokens,
    enabled: Boolean(row.enabled),
    costPerMessage: row.cost_per_message,
    createdAt: Number(row.created_at),
  }));
}

export async function getChatModel(id: string): Promise<ChatModel | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM chat_models WHERE id = ?', [id]);
  const models = rows as any[];
  if (models.length === 0) return null;

  const row = models[0];
  return {
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    modelId: row.model_id,
    supportsVision: Boolean(row.supports_vision),
    maxTokens: row.max_tokens,
    enabled: Boolean(row.enabled),
    costPerMessage: row.cost_per_message,
    createdAt: Number(row.created_at),
  };
}

export async function createChatModel(model: Omit<ChatModel, 'id' | 'createdAt'>): Promise<ChatModel> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_models (id, name, api_url, api_key, model_id, supports_vision, max_tokens, enabled, cost_per_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, model.name, model.apiUrl, model.apiKey, model.modelId, model.supportsVision, model.maxTokens, model.enabled, model.costPerMessage, now]
  );

  return { ...model, id, createdAt: now };
}

export async function updateChatModel(id: string, updates: Partial<Omit<ChatModel, 'id' | 'createdAt'>>): Promise<ChatModel | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.apiUrl !== undefined) { fields.push('api_url = ?'); values.push(updates.apiUrl); }
  if (updates.apiKey !== undefined) { fields.push('api_key = ?'); values.push(updates.apiKey); }
  if (updates.modelId !== undefined) { fields.push('model_id = ?'); values.push(updates.modelId); }
  if (updates.supportsVision !== undefined) { fields.push('supports_vision = ?'); values.push(updates.supportsVision); }
  if (updates.maxTokens !== undefined) { fields.push('max_tokens = ?'); values.push(updates.maxTokens); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }
  if (updates.costPerMessage !== undefined) { fields.push('cost_per_message = ?'); values.push(updates.costPerMessage); }

  if (fields.length === 0) return getChatModel(id);

  values.push(id);
  await db.execute(`UPDATE chat_models SET ${fields.join(', ')} WHERE id = ?`, values);

  return getChatModel(id);
}

export async function deleteChatModel(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_models WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// 聊天会话操作
// ========================================

export async function createChatSession(userId: string, modelId: string, title = '新对话'): Promise<ChatSession> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_sessions (id, user_id, title, model_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, title, modelId, now, now]
  );

  return { id, userId, title, modelId, createdAt: now, updatedAt: now };
}

export async function getUserChatSessions(userId: string, limit = 50): Promise<ChatSession[]> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
    [userId, limit]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    modelId: row.model_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export async function getChatSession(id: string): Promise<ChatSession | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM chat_sessions WHERE id = ?', [id]);
  const sessions = rows as any[];
  if (sessions.length === 0) return null;

  const row = sessions[0];
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    modelId: row.model_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function updateChatSession(id: string, updates: { title?: string; modelId?: string }): Promise<ChatSession | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.modelId !== undefined) { fields.push('model_id = ?'); values.push(updates.modelId); }

  values.push(id);
  await db.execute(`UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = ?`, values);

  return getChatSession(id);
}

export async function deleteChatSession(id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_sessions WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

// ========================================
// 聊天消息操作
// ========================================

export async function saveChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  await initializeDatabase();
  const db = getAdapter();

  const id = generateId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO chat_messages (id, session_id, role, content, images, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, message.sessionId, message.role, message.content, JSON.stringify(message.images || []), message.tokenCount, now]
  );

  // 更新会话时间
  await db.execute('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [now, message.sessionId]);

  return { ...message, id, createdAt: now };
}

export async function getSessionMessages(sessionId: string, limit = 100): Promise<ChatMessage[]> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?',
    [sessionId, limit]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images || []),
    tokenCount: row.token_count,
    createdAt: Number(row.created_at),
  }));
}

// 获取会话消息用于上下文（自动截断�?maxTokens 的一半）
export async function getSessionContext(sessionId: string, maxTokens = 128000): Promise<ChatMessage[]> {
  const messages = await getSessionMessages(sessionId, 200);
  
  // 截断�?maxTokens 的一半（64k for 128k context�?
  const targetTokens = Math.floor(maxTokens / 2);
  let totalTokens = 0;
  const result: ChatMessage[] = [];

  // 从最新消息开始，保留最近的对话
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (totalTokens + msg.tokenCount > targetTokens && result.length > 0) {
      break;
    }
    result.push(msg);
    totalTokens += msg.tokenCount;
  }

  return result.reverse();
}

export async function deleteSessionMessages(sessionId: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  return (result as any).affectedRows > 0;
}

// ========================================
// 角色卡操作
// ========================================

export async function saveCharacterCard(
  card: Omit<CharacterCard, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CharacterCard> {
  await initializeDatabase();
  const db = getAdapter();

  const now = Date.now();
  const newCard: CharacterCard = {
    ...card,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO character_cards (id, user_id, character_name, avatar_url, source_video_url, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newCard.id,
      newCard.userId,
      newCard.characterName,
      newCard.avatarUrl,
      newCard.sourceVideoUrl || null,
      newCard.status,
      newCard.errorMessage || null,
      newCard.createdAt,
      newCard.updatedAt,
    ]
  );

  return newCard;
}

export async function updateCharacterCard(
  id: string,
  updates: Partial<Pick<CharacterCard, 'characterName' | 'avatarUrl' | 'status' | 'errorMessage'>>
): Promise<CharacterCard | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.characterName !== undefined) {
    fields.push('character_name = ?');
    values.push(updates.characterName);
  }
  if (updates.avatarUrl !== undefined) {
    fields.push('avatar_url = ?');
    values.push(updates.avatarUrl);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  values.push(id);
  await db.execute(
    `UPDATE character_cards SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return getCharacterCard(id);
}

export async function getCharacterCard(id: string): Promise<CharacterCard | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute('SELECT * FROM character_cards WHERE id = ?', [id]);
  const cards = rows as any[];
  if (cards.length === 0) return null;

  const row = cards[0];
  return {
    id: row.id,
    userId: row.user_id,
    characterName: row.character_name || '',
    avatarUrl: row.avatar_url || '',
    sourceVideoUrl: row.source_video_url || undefined,
    status: row.status || 'pending',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  };
}

export async function getUserCharacterCards(
  userId: string,
  limit = 50,
  offset = 0
): Promise<CharacterCard[]> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    `SELECT * FROM character_cards WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    characterName: row.character_name || '',
    avatarUrl: row.avatar_url || '',
    sourceVideoUrl: row.source_video_url || undefined,
    status: row.status || 'pending',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function getPendingCharacterCards(userId: string, limit = 50): Promise<CharacterCard[]> {
  await initializeDatabase();
  const db = getAdapter();
  const safeLimit = Math.max(limit, 1);

  const [rows] = await db.execute(
    `SELECT * FROM character_cards WHERE user_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT ?`,
    [userId, safeLimit]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    characterName: row.character_name || '',
    avatarUrl: row.avatar_url || '',
    sourceVideoUrl: row.source_video_url || undefined,
    status: row.status,
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  }));
}

export async function deleteCharacterCard(id: string, userId: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM character_cards WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return (result as any).affectedRows > 0;
}

// ========================================
// Workspace operations
// ========================================

function parseWorkspaceData(raw: unknown): WorkspaceData {
  if (!raw) {
    return { nodes: [], edges: [] };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as WorkspaceData;
      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const data = raw as WorkspaceData;
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
    };
  }
  return { nodes: [], edges: [] };
}

export async function createWorkspace(
  userId: string,
  name: string,
  data: WorkspaceData = { nodes: [], edges: [] }
): Promise<Workspace> {
  await initializeDatabase();
  const db = getAdapter();
  const id = generateId();
  const now = Date.now();
  const safeData = parseWorkspaceData(data);

  await db.execute(
    `INSERT INTO workspaces (id, user_id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name, JSON.stringify(safeData), now, now]
  );

  return {
    id,
    userId,
    name,
    data: safeData,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getWorkspaceSummaries(
  userId: string,
  options: { search?: string; sort?: 'updated' | 'created'; order?: 'asc' | 'desc'; limit?: number; offset?: number } = {}
): Promise<WorkspaceSummary[]> {
  await initializeDatabase();
  const db = getAdapter();
  const limit = Math.max(options.limit ?? 200, 1);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = options.search?.trim();
  const sort = options.sort === 'created' ? 'created_at' : 'updated_at';
  const order = options.order === 'asc' ? 'ASC' : 'DESC';

  let sql = 'SELECT id, name, created_at, updated_at FROM workspaces WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (search) {
    sql += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  sql += ` ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [rows] = await db.execute(sql, params);

  return (rows as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export async function getWorkspaceById(userId: string, id: string): Promise<Workspace | null> {
  await initializeDatabase();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT * FROM workspaces WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  const workspaces = rows as any[];
  if (workspaces.length === 0) return null;

  const row = workspaces[0];
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    data: parseWorkspaceData(row.data),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function updateWorkspace(
  userId: string,
  id: string,
  updates: { name?: string; data?: WorkspaceData }
): Promise<Workspace | null> {
  await initializeDatabase();
  const db = getAdapter();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.data !== undefined) {
    const safeData = parseWorkspaceData(updates.data);
    fields.push('data = ?');
    values.push(JSON.stringify(safeData));
  }

  if (fields.length === 1) {
    return getWorkspaceById(userId, id);
  }

  values.push(id, userId);

  await db.execute(
    `UPDATE workspaces SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values
  );

  return getWorkspaceById(userId, id);
}

export async function deleteWorkspace(userId: string, id: string): Promise<boolean> {
  await initializeDatabase();
  const db = getAdapter();

  const [result] = await db.execute(
    'DELETE FROM workspaces WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return (result as any).affectedRows > 0;
}
