# SanHub

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/UI-Vercel_dark-111111?style=flat-square" alt="Vercel dark UI" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

<p align="center">
  自托管 AI 创作平台：图像、视频、角色卡与节点工作流。<br />
  界面默认深色，沿用 Vercel 式的克制排版与边框层次，不绑定单一模型厂商。
</p>

---

## 产品形态

SanHub 是一个渠道聚合的创作后台，而不是某个封闭模型的套壳。管理员在后台接入图像 / 视频 / 对话渠道后，用户在统一创作页提交任务、在历史里回看，在工作区里把节点串成流程。

界面默认黑色（`hsl(220 14% 6%)` 底、浅字、细边框）。没有独立的亮色主题。

## 功能

### 创作

- `/create`：图片 / 视频统一入口，按已启用模型切换
- 文生图、图生图、参考图复用
- 视频支持参考图、时长与比例（取决于渠道）
- 任务异步提交，状态轮询，失败退积分

### 工作区

- `/workspace/[id]`：独立编辑器布局，不套仪表盘侧栏
- 按节点类型懒加载 catalog
- 图像 / 视频 / 对话节点可连接

### 角色卡

- 从视频或参考图提取角色
- 历史页独立 tab，工作区可引用

### 历史与广场

- `/history`：图像 / 视频 / 角色卡，顶栏统计全部进行中任务
- `/square`：可选社区浏览（后台开关）

### 管理

- 用户、积分、卡密、邀请码
- 图像渠道、视频渠道、对话模型，按模型定价
- 公告、注册开关、图床（PicUI / S3 兼容）
- 公开站点文案（名称、页脚、说明）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 14 App Router |
| 语言 | TypeScript |
| 样式 | Tailwind CSS，默认深色 |
| 认证 | NextAuth.js Credentials |
| 数据库 | SQLite 或 MySQL |
| 对象存储 | 本地 `data/media`、PicUI、S3 兼容 |
| 部署 | Docker / Vercel |

热路径按切片读配置和 catalog，不再把管理端整包打进出图 / 出视频 / 媒体服务。

## 快速开始

### Docker

```bash
git clone https://github.com/genz27/sanhub.git
cd sanhub
docker-compose up -d
```

访问 http://localhost:3000

| 项目 | 值 |
|------|-----|
| 默认管理员邮箱 | `admin@sanhub.local` |
| 默认管理员密码 | `sanhub123` |

首次登录后立刻改密码。

```bash
docker-compose logs -f
docker-compose down
docker-compose up -d --build
```

域名访问时在 `docker-compose.yml` 里设置：

```yaml
environment:
  - NEXTAUTH_URL=https://your-domain.com
  - ADMIN_EMAIL=admin@example.com
  - ADMIN_PASSWORD=your-secure-password
```

本地 `localhost:3000` 不需要 `NEXTAUTH_URL`。

### 本地开发

```bash
git clone https://github.com/genz27/sanhub.git
cd sanhub
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` 至少设置 `NEXTAUTH_SECRET`，以及首次管理员 `ADMIN_EMAIL` / `ADMIN_PASSWORD`。首次启动会建库并创建管理员。

## 数据库

| 类型 | 适用 |
|------|------|
| SQLite | 默认，开发或单机 |
| MySQL | 生产、多实例 |

```env
DB_TYPE=sqlite

# DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=sanhub
```

仍兼容旧的 `DB_HOST` / `DB_USER` / `DB_NAME` 别名。

## 渠道

模型密钥和 Base URL 配在管理后台，不写死在前端。

**图像渠道**常见类型：`gemini`、`openai-compatible`、`openai-chat`、`modelscope`、`gitee`、`apexerapi`。

**视频渠道**常见类型：

- `openai-compatible`：OpenAI Chat Completions
- `flow2api`：`POST /v1/chat/completions`，支持 `image_url`
- `grok2api`：Chat Completions + `video_config`
- `apexerapi`：`/v1/videos` 一类任务接口

积分在 `/admin/image-channels` 与 `/admin/video-channels` 按模型配置。历史库里的旧任务类型名可能仍带历史前缀，只影响展示与兼容读取，不代表产品还绑定该厂商。

## 图床

| 方式 | 说明 |
|------|------|
| PicUI | 后台配置 Token 后上传，返回 URL |
| S3 兼容 | 通过 `/cache/s3` 读回，支持 path prefix |
| 本地文件 | `./data/media/` |
| Data URL | 上传失败时的回退 |

## 目录

```
sanhub/
├── app/
│   ├── (auth)/                 # login / register
│   ├── (dashboard)/            # create, history, square, settings
│   ├── (editor)/workspace/     # node editor, no dashboard chrome
│   ├── admin/                  # users, channels, site, billing
│   └── api/                    # app and OpenAI-compatible v1
├── components/
│   ├── generator/              # image / video studio
│   ├── history/                # gallery and lightbox
│   ├── workspace/              # editor nodes
│   └── layout/                 # sidebar, dashboard shell
├── lib/
│   ├── db/                     # sliced reads/writes, no mega barrel on hot paths
│   ├── image-*.ts              # image adapters, loaded per channel
│   └── site-config.ts          # public site copy
├── data/                       # sqlite + local media
└── types/
```

## 环境变量

完整列表见 [.env.example](./.env.example)。渠道密钥也可以只在管理后台配置。

## API

对外兼容层在 `/v1/*`（图像 generations/edits、对话 completions、视频任务）。说明见 [IMAGE_API.md](./IMAGE_API.md)。这是渠道转发，不是某个厂商的官方 SDK。

## 许可证

[MIT License](./LICENSE)

---

<p align="center">
  <a href="https://github.com/genz27">genz27</a>
</p>
