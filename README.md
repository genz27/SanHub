# SanHub - AI 创意工作室

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=flat-square&logo=tailwindcss" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

<p align="center">
  融合 <b>OpenAI Sora</b>、<b>Google Gemini</b>、<b>Z-Image</b>、<b>Gitee AI</b> 等多种 AI 生成服务的统一创作平台
</p>

---

## ✨ 功能特性

### 🎬 视频生成
- Sora 视频生成（10s / 15s）
- 支持 16:9、9:16、1:1 多种比例
- 参考图/视频驱动生成
- 实时任务状态追踪
- **三种创作模式**：普通生成、视频 Remix、视频分镜

### 🎨 图像生成
- **Gemini Nano** - 极速出图模式
- **Gemini Pro** - 4K 高清模式
- **Z-Image** - ModelScope 图像生成
- **Gitee AI** - 国产 AI 图像服务
- 风格迁移与编辑

### �览️ 工作空间
- 可视化工作流画布
- 节点拖拽与连接
- 多工作空间管理
- AI 对话节点集成

### 📝 提示词模板
- 11 种预设创作模板
- 3x3 电影镜头图、分镜故事板
- 角色情绪板、场景概念图
- 剧本大纲、场景对话生成
- 电影海报风格等

### 🖼️ 作品广场
- 瀑布流浏览社区作品
- 热门 / 最新排序
- 一键复制提示词
- 作品公开分享
- 用户主页展示

### 🎤 角色卡
- 视频驱动角色创建
- 自动提取角色头像
- 角色库管理

### 🛠️ 系统管理
- 用户管理与权限控制
- **图像渠道管理** - 统一管理图像生成渠道和模型
- **视频渠道管理** - 统一管理视频生成渠道和模型
- **AI 对话模型管理**
- **Sora Token 管理**
- 渠道内模型独立定价
- 系统公告发布
- 注册开关控制
- PicUI 图床集成

### 🔐 安全特性
- NextAuth.js 认证
- 验证码保护
- 请求频率限制
- 用户禁用机制

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Next.js 14 (App Router) |
| **语言** | TypeScript |
| **样式** | TailwindCSS + shadcn/ui 风格 |
| **认证** | NextAuth.js |
| **数据库** | SQLite / MySQL（可切换） |
| **图标** | Lucide React |
| **部署** | Docker / Vercel / EdgeOne |
| **图床** | PicUI (可选) |

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

**零配置，一行命令启动：**

```bash
git clone https://github.com/genz27/sanhub.git && cd sanhub && docker-compose up -d
```

启动后访问 http://localhost:3000

| 项目 | 值 |
|------|-----|
| 默认管理员邮箱 | `admin@sanhub.local` |
| 默认管理员密码 | `sanhub123` |

> ⚠️ **首次登录后请立即在「用户设置」中修改密码！**

**常用命令：**

```bash
docker-compose logs -f    # 查看日志
docker-compose down       # 停止服务
docker-compose up -d --build  # 重新构建
```

**生产环境部署（使用自定义域名）：**

编辑 `docker-compose.yml`，取消注释并修改：

```yaml
environment:
  - NEXTAUTH_URL=https://your-domain.com  # 必填：你的访问域名
  - ADMIN_EMAIL=admin@example.com         # 可选：自定义管理员邮箱
  - ADMIN_PASSWORD=your-secure-password   # 可选：自定义管理员密码
```

> 💡 `NEXTAUTH_URL` 只有在使用域名访问时才需要配置，本地 `localhost:3000` 访问无需设置。

---

### 方式二：本地开发

```bash
# 1. 克隆项目
git clone https://github.com/genz27/sanhub.git
cd sanhub

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，至少设置 NEXTAUTH_SECRET 和 ADMIN_EMAIL/ADMIN_PASSWORD

# 4. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

首次运行会自动创建数据库和管理员账号。

## 💾 数据库选择

| 类型 | 优势 | 适用场景 |
|------|------|----------|
| **SQLite** | 零配置、开箱即用 | 开发环境、小规模部署 |
| **MySQL** | 高并发、多实例支持 | 生产环境 |

切换数据库只需修改 `.env.local`：

```env
# SQLite（默认）
DB_TYPE=sqlite

# MySQL（推荐使用 MYSQL_*，同时兼容旧的 DB_* 别名）
DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=sanhub
# MYSQL_SSL=false
```

## 📁 项目结构

```
sanhub/
├── app/
│   ├── (auth)/              # 登录/注册页面
│   ├── (dashboard)/         # 用户面板
│   │   ├── video/           # 视频生成
│   │   ├── image/           # 图像生成
│   │   ├── workspace/       # 工作空间
│   │   ├── gallery/         # 作品广场
│   │   ├── square/          # 社区广场
│   │   ├── history/         # 历史记录
│   │   └── settings/        # 用户设置
│   ├── admin/               # 管理后台
│   │   ├── users/           # 用户管理
│   │   ├── models/          # AI 聊天模型管理
│   │   ├── image-channels/  # 图像渠道管理
│   │   ├── video-channels/  # 视频渠道管理
│   │   ├── tokens/          # Sora Token 管理
│   │   ├── site/            # 网站配置
│   │   └── announcement/    # 公告管理
│   └── api/                 # API 路由
├── components/
│   ├── ui/                  # 基础 UI 组件
│   ├── generator/           # 生成器组件
│   ├── workspace/           # 工作空间组件
│   └── layout/              # 布局组件
├── data/
│   ├── media/               # 媒体文件存储
│   └── prompts/             # 提示词模板
├── lib/
│   ├── db.ts                # 数据库操作
│   ├── db-adapter.ts        # 数据库适配器
│   ├── auth.ts              # 认证配置
│   ├── image-generator.ts   # 统一图像生成器
│   ├── sora.ts              # Sora API 封装
│   ├── gemini.ts            # Gemini API 封装
│   ├── zimage.ts            # Z-Image API 封装
│   ├── model-config.ts      # 模型配置（旧，兼容）
│   └── picui.ts             # PicUI 图床 API
└── types/                   # TypeScript 类型定义
```

## 💰 积分消耗

积分消耗在管理后台的渠道管理中按模型独立配置：

- **图像渠道** (`/admin/image-channels`) - 每个图像模型可设置独立的 `costPerGeneration`
- **视频渠道** (`/admin/video-channels`) - 每个视频模型按时长配置不同价格（如 10s=100, 15s=150, 25s=200）

> 💡 首次使用可点击「从旧配置迁移」按钮自动创建默认渠道和模型

### 视频渠道 Type 对照（`/admin/video-channels`）

- `sora`：OpenAI Sora 风格接口
- `openai-compatible`：标准 OpenAI Chat Completions 适配
- `flow2api`：按 Flow2API 的 `POST /v1/chat/completions` 请求方式（`model + messages`，支持 `image_url` 多模态）
- `grok2api`：Grok 视频接口（同样走 Chat Completions，并支持 `video_config`）

> 说明：`Flow2API` / `flow2apiw` 在管理接口中会被统一归一化为 `flow2api`。

## 🖼️ 图床配置

生成的图片和角色卡头像支持上传到 PicUI 图床，减少数据库体积。

| 存储方式 | 说明 |
|----------|------|
| **PicUI 图床** | 配置 API Token 后自动上传，返回图片 URL |
| **本地文件** | 未配置图床时保存到 `./data/media/` |
| **Base64** | 全部失败时回退到数据库存储 |

在管理后台 `/admin/site` 配置 PicUI Token（从 picui.cn 个人中心获取）。

## 📖 环境变量

详见 [.env.example](./.env.example) 文件，包含所有可配置项及说明。

## 📸 截图预览

<details>
<summary>点击展开截图</summary>

### 首页
![首页](./img/home.png)

### 视频生成
![视频生成](./img/video.png)

### 图像生成
![图像生成](./img/image.png)

### 管理后台
![管理后台](./img/admin.png)

</details>

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](./LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/genz27">genz27</a>
</p>
