# Sora2API v1 接口文档

## 概述

Sora2API 是一个兼容 OpenAI API 格式的 Sora 视频/图片生成服务。本文档详细描述了所有 v1 版本的 API 接口。

**✅ 已兼容 [new-api](https://github.com/Calcium-Ion/new-api) sora2 渠道对接格式**

## 基础信息

- **Base URL**: `http://your-server:port`
- **认证方式**: Bearer Token (API Key)
- **请求格式**: JSON / multipart/form-data
- **响应格式**: JSON

## 认证

所有 v1 接口（除管理接口外）需要在请求头中携带 API Key：

```
Authorization: Bearer your-api-key
```

---

## 目录

1. [模型接口](#1-模型接口)
2. [Chat Completions 接口](#2-chat-completions-接口)
3. [视频生成接口](#3-视频生成接口) ⭐ new-api 兼容
4. [图片生成接口](#4-图片生成接口)
5. [角色创建接口](#5-角色创建接口)
6. [公共数据接口](#6-公共数据接口)
7. [管理接口](#7-管理接口)

---

## 1. 模型接口

### GET /v1/models

获取可用模型列表。

**请求示例:**
```bash
curl -X GET "http://your-server/v1/models" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "sora-video-landscape-10s",
      "object": "model",
      "owned_by": "sora2api",
      "description": "Video generation - landscape"
    },
    {
      "id": "sora-video-portrait-10s",
      "object": "model",
      "owned_by": "sora2api",
      "description": "Video generation - portrait"
    },
    {
      "id": "sora-image",
      "object": "model",
      "owned_by": "sora2api",
      "description": "Image generation - 1024x1024"
    },
    {
      "id": "sora-image-landscape",
      "object": "model",
      "owned_by": "sora2api",
      "description": "Image generation - 1792x1024"
    },
    {
      "id": "sora-image-portrait",
      "object": "model",
      "owned_by": "sora2api",
      "description": "Image generation - 1024x1792"
    }
  ]
}
```

**可用模型列表:**

| 模型 ID | 类型 | 描述 |
|---------|------|------|
| `sora-video-landscape-10s` | 视频 | 横屏 10 秒视频 |
| `sora-video-portrait-10s` | 视频 | 竖屏 10 秒视频 |
| `sora-video-landscape-15s` | 视频 | 横屏 15 秒视频 |
| `sora-video-portrait-15s` | 视频 | 竖屏 15 秒视频 |
| `sora-video-landscape-25s` | 视频 | 横屏 25 秒视频 |
| `sora-video-portrait-25s` | 视频 | 竖屏 25 秒视频 |
| `sora-image` | 图片 | 1024x1024 正方形图片 |
| `sora-image-landscape` | 图片 | 1792x1024 横屏图片 |
| `sora-image-portrait` | 图片 | 1024x1792 竖屏图片 |

---

## 2. Chat Completions 接口

### POST /v1/chat/completions

统一的聊天补全接口，支持图片和视频生成。兼容 OpenAI Chat API 格式。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `model` | string | 是 | 模型 ID |
| `messages` | array | 是 | 消息数组 |
| `stream` | boolean | 否 | 是否流式输出，默认 false |
| `image` | string | 否 | Base64 编码的参考图片（图生视频） |
| `video` | string | 否 | Base64 编码的视频（角色创建） |
| `remix_target_id` | string | 否 | Sora 分享链接视频 ID（用于 remix） |
| `style_id` | string | 否 | 视频风格 |
| `character_options` | object | 否 | 角色创建选项 |

**消息格式:**

```json
{
  "role": "user",
  "content": "A cat walking in the park"
}
```

**多模态消息格式:**

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "A cat walking"},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,xxx"}}
  ]
}
```

**视频风格 (style_id):**
- `festive` - 节日风格
- `retro` - 复古风格
- `news` - 新闻风格
- `selfie` - 自拍风格
- `handheld` - 手持风格
- `anime` - 动漫风格

**请求示例 (文生视频):**
```bash
curl -X POST "http://your-server/v1/chat/completions" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-video-landscape-10s",
    "messages": [
      {"role": "user", "content": "A beautiful sunset over the ocean"}
    ],
    "stream": true
  }'
```

**请求示例 (图生视频):**
```bash
curl -X POST "http://your-server/v1/chat/completions" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-video-landscape-10s",
    "messages": [
      {"role": "user", "content": "Make this image come alive"}
    ],
    "image": "base64_encoded_image_data",
    "stream": true
  }'
```

**流式响应格式 (SSE):**
```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"sora","choices":[{"index":0,"delta":{"role":"assistant","content":null,"reasoning_content":{"stage":"generation","status":"processing","progress":50,"message":"生成中..."}},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"sora","choices":[{"index":0,"delta":{"content":"{\"type\":\"video\",\"url\":\"https://...\"}"},"finish_reason":"stop"}]}

data: [DONE]
```

**非流式响应:**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "sora-video-landscape-10s",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"type\":\"video\",\"url\":\"https://...\"}"
      },
      "finish_reason": "stop"
    }
  ]
}
```

---

## 3. 视频生成接口

> **注意**: 本接口已兼容 new-api-main sora2 relay 格式

### POST /v1/videos

创建视频生成任务（兼容 new-api-main sora2 格式）。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `prompt` | string | 是 | 视频生成提示词 |
| `model` | string | 否 | 模型：`sora-2` 或 `sora-2-pro`，默认 `sora-2` |
| `seconds` | string | 否 | 时长：`10` 或 `15`，默认 `15` |
| `size` | string | 否 | 分辨率：`720x1280`(竖屏) 或 `1280x720`(横屏) |
| `orientation` | string | 否 | 方向：`landscape` 或 `portrait` |
| `style_id` | string | 否 | 视频风格 |
| `input_reference` | file | 否 | 参考图片文件（multipart/form-data） |
| `input_image` | string | 否 | Base64 编码的参考图片 |
| `remix_target_id` | string | 否 | Remix 目标视频 ID |
| `metadata` | string | 否 | 扩展参数（JSON 字符串） |
| `async_mode` | boolean | 否 | 异步模式，默认 true |

**请求示例 (JSON):**
```bash
curl -X POST "http://your-server/v1/videos" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball",
    "model": "sora-2",
    "seconds": "10",
    "size": "1280x720"
  }'
```

**请求示例 (multipart/form-data):**
```bash
curl -X POST "http://your-server/v1/videos" \
  -H "Authorization: Bearer your-api-key" \
  -F "prompt=A cat playing with a ball" \
  -F "model=sora-2" \
  -F "seconds=10" \
  -F "input_reference=@reference.jpg;type=image/jpeg"
```

**异步模式响应 (status: 201, new-api-main 兼容格式):**
```json
{
  "id": "sora-2-abc123def456",
  "object": "video",
  "model": "sora-2",
  "status": "in_progress",
  "progress": 0,
  "created_at": 1702388400,
  "seconds": "10",
  "size": "1280x720"
}
```

**同步模式响应 (async_mode=false):**
```json
{
  "id": "sora-2-abc123def456",
  "object": "video",
  "model": "sora-2",
  "status": "completed",
  "progress": 100,
  "created_at": 1702388400,
  "completed_at": 1702388500,
  "seconds": "10",
  "size": "1280x720"
}
```

---

### GET /v1/videos/{video_id}

获取视频生成任务状态（new-api-main 兼容格式）。

**路径参数:**
- `video_id`: 视频任务 ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/videos/sora-2-abc123def456" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "id": "sora-2-abc123def456",
  "object": "video",
  "model": "sora-2",
  "status": "in_progress",
  "progress": 65,
  "created_at": 1702388400,
  "seconds": "10",
  "size": "1280x720"
}
```

**状态值 (new-api-main 兼容):**
- `queued` - 排队中
- `pending` - 等待中
- `in_progress` - 处理中
- `processing` - 处理中
- `completed` - 成功
- `failed` - 失败
- `cancelled` - 已取消

**完整响应字段:**

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | string | 任务 ID |
| `object` | string | 固定为 "video" |
| `model` | string | 模型名称 |
| `status` | string | 任务状态 |
| `progress` | integer | 进度百分比 (0-100) |
| `created_at` | integer | 创建时间戳（秒） |
| `completed_at` | integer | 完成时间戳（秒，可选） |
| `expires_at` | integer | 过期时间戳（秒，可选） |
| `seconds` | string | 视频时长 |
| `size` | string | 视频分辨率 |
| `remixed_from_video_id` | string | Remix 来源视频 ID（可选） |
| `error` | object | 错误信息 `{message, code}`（失败时） |
| `metadata` | object | 扩展元数据（可选） |

---

### GET /v1/videos/{video_id}/content

获取视频直链（302 重定向到实际视频 URL）。

> **注意**: 此端点返回 302 重定向到视频直链，而不是视频文件本身。new-api 会将此 URL 作为最终结果返回给用户。

**路径参数:**
- `video_id`: 视频任务 ID

**请求示例:**
```bash
# 直接下载视频（-L 跟随重定向）
curl -X GET "http://your-server/v1/videos/sora-2-abc123def456/content" \
  -H "Authorization: Bearer your-api-key" \
  -L -o video.mp4

# 仅获取重定向 URL
curl -X GET "http://your-server/v1/videos/sora-2-abc123def456/content" \
  -H "Authorization: Bearer your-api-key" \
  -I
```

**响应:**
- 成功：`302 Found` 重定向到视频直链（如 `https://xxx.mp4`）
- 失败：`400 Bad Request`（任务未完成或失败）
- 未找到：`404 Not Found`（任务不存在）

**错误响应格式:**
```json
{
  "error": {
    "message": "Task not completed. Current status: in_progress",
    "code": "task_not_completed"
  }
}
```

**错误码:**
| code | 描述 |
|------|------|
| `task_not_found` | 任务不存在 |
| `task_not_completed` | 任务未完成 |
| `content_not_found` | 视频内容不可用 |
| `generation_failed` | 视频生成失败 |

---

### POST /v1/videos/{video_id}/remix

基于现有视频创建 Remix（new-api 兼容）。

**路径参数:**
- `video_id`: 源视频 ID

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `prompt` | string | 是 | Remix 提示词 |
| `model` | string | 否 | 模型：`sora-2` 或 `sora-2-pro` |
| `seconds` | string | 否 | 时长：`10` 或 `15` |
| `size` | string | 否 | 分辨率 |
| `style_id` | string | 否 | 视频风格 |
| `async_mode` | boolean | 否 | 异步模式，默认 true |

**请求示例:**
```bash
curl -X POST "http://your-server/v1/videos/sora-2-abc123def456/remix" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make it more colorful and vibrant"
  }'
```

**响应示例:**
```json
{
  "id": "sora-2-newvideo789",
  "object": "video",
  "model": "sora-2",
  "status": "in_progress",
  "progress": 0,
  "created_at": 1702388400,
  "seconds": "15",
  "size": "1280x720",
  "remixed_from_video_id": "sora-2-abc123def456"
}
```

---

## 4. 图片生成接口

### POST /v1/images/generations

创建图片生成（兼容 OpenAI Images API）。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `prompt` | string | 是 | 图片生成提示词 |
| `model` | string | 否 | 模型：`sora-image`, `sora-image-landscape`, `sora-image-portrait` |
| `n` | integer | 否 | 生成数量（目前仅支持 1） |
| `size` | string | 否 | 尺寸：`1024x1024`, `1792x1024`, `1024x1792` |
| `quality` | string | 否 | 质量：`standard` 或 `hd` |
| `style` | string | 否 | 风格：`natural` 或 `vivid` |
| `response_format` | string | 否 | 响应格式：`url` 或 `b64_json` |
| `input_reference` | file | 否 | 参考图片文件 |
| `input_image` | string | 否 | Base64 编码的参考图片 |

**请求示例 (JSON):**
```bash
curl -X POST "http://your-server/v1/images/generations" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "model": "sora-image-landscape",
    "size": "1792x1024"
  }'
```

**请求示例 (multipart/form-data):**
```bash
curl -X POST "http://your-server/v1/images/generations" \
  -H "Authorization: Bearer your-api-key" \
  -F "prompt=A beautiful sunset over mountains" \
  -F "model=sora-image-landscape" \
  -F "size=1792x1024" \
  -F "input_reference=@reference.jpg;type=image/jpeg"
```

**响应示例:**
```json
{
  "created": 1702388400,
  "data": [
    {
      "url": "https://...",
      "revised_prompt": "A beautiful sunset over mountains"
    }
  ]
}
```

---

## 5. 角色创建接口

### POST /v1/characters

从视频创建角色（角色卡）。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `model` | string | 否 | 视频模型，默认 `sora-video-10s` |
| `video` | file | 是* | 视频文件（multipart/form-data） |
| `video_base64` | string | 是* | Base64 编码的视频 |
| `timestamps` | string | 否 | 视频时间戳，如 `0,3` |
| `username` | string | 否 | 角色用户名 |
| `display_name` | string | 否 | 角色显示名称 |
| `instruction_set` | string | 否 | 角色指令集 |
| `safety_instruction_set` | string | 否 | 安全指令集 |

*注：`video` 和 `video_base64` 二选一

**请求示例 (multipart/form-data):**
```bash
curl -X POST "http://your-server/v1/characters" \
  -H "Authorization: Bearer your-api-key" \
  -F "model=sora-video-10s" \
  -F "video=@character_video.mp4;type=video/mp4" \
  -F "timestamps=0,3" \
  -F "username=my_character" \
  -F "display_name=My Character"
```

**请求示例 (JSON):**
```bash
curl -X POST "http://your-server/v1/characters" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-video-10s",
    "video": "base64_encoded_video_data",
    "timestamps": "0,3",
    "username": "my_character",
    "display_name": "My Character"
  }'
```

**响应示例:**
```json
{
  "id": "char_xxxxxxxxxxxx",
  "object": "character",
  "created": 1702388400,
  "model": "sora-video-10s",
  "data": {
    "cameo_id": "ch_xxxxxxxxxxxx",
    "username": "my_character",
    "display_name": "My Character",
    "message": "Character created successfully"
  }
}
```

---

## 6. 公共数据接口

### GET /v1/stats

获取系统统计信息。

**请求示例:**
```bash
curl -X GET "http://your-server/v1/stats" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "stats": {
    "total_tokens": 10,
    "active_tokens": 8,
    "today_images": 50,
    "total_images": 1000,
    "today_videos": 20,
    "total_videos": 500,
    "today_errors": 2,
    "total_errors": 50
  }
}
```

---

### GET /v1/invite-codes

获取随机邀请码（从有剩余 Sora2 配额的 Token 中）。

**请求示例:**
```bash
curl -X GET "http://your-server/v1/invite-codes" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "invite_code": "ABC123",
  "remaining_count": 5,
  "total_count": 10,
  "email": "user@example.com"
}
```

---

### GET /v1/profiles/{username}

获取用户资料。

**路径参数:**
- `username`: 用户名

**查询参数:**
- `token_id` (可选): 指定使用的 Token ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/profiles/john_doe" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "profile": {
    "user_id": "user-xxx",
    "username": "john_doe",
    "display_name": "John Doe",
    "profile_picture_url": "https://...",
    "follower_count": 100,
    "verified": false
  }
}
```

---

### GET /v1/users/{user_id}/feed

获取用户发布的作品。

**路径参数:**
- `user_id`: 用户 ID（如 `user-4qluo8ATzeEsuvCpOUAfAZY0`）

**查询参数:**
- `limit` (可选): 返回数量，默认 8
- `cursor` (可选): 分页游标
- `token_id` (可选): 指定使用的 Token ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/users/user-xxx/feed?limit=10" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "user_id": "user-xxx",
  "feed": {
    "items": [...],
    "cursor": "next_page_cursor"
  }
}
```

---

### GET /v1/characters/search

搜索角色。

**查询参数:**
- `username`: 搜索的用户名
- `intent` (可选): 搜索意图，`users`（所有用户）或 `cameo`（可用于视频生成的用户），默认 `users`
- `token_id` (可选): 指定使用的 Token ID
- `limit` (可选): 返回数量，默认 10

**请求示例:**
```bash
curl -X GET "http://your-server/v1/characters/search?username=john&intent=cameo&limit=5" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "query": "john",
  "count": 3,
  "results": [
    {
      "user_id": "user-xxx",
      "username": "john_doe",
      "display_name": "John Doe",
      "profile_picture_url": "https://...",
      "can_cameo": true,
      "verified": false,
      "follower_count": 100,
      "token": "<@ch_xxx>",
      "owner": {
        "user_id": "user-yyy",
        "username": "owner_name",
        "display_name": "Owner"
      }
    }
  ]
}
```

---

### GET /v1/feed

获取公共 Feed。

**查询参数:**
- `limit` (可选): 返回数量，默认 8
- `cut` (可选): Feed 类型，`nf2_latest`（最新）或 `nf2_top`（热门），默认 `nf2_latest`
- `cursor` (可选): 分页游标
- `token_id` (可选): 指定使用的 Token ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/feed?limit=10&cut=nf2_top" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "cut": "nf2_top",
  "count": 10,
  "cursor": "next_page_cursor",
  "items": [
    {
      "id": "post-xxx",
      "text": "A beautiful sunset",
      "permalink": "https://...",
      "preview_image_url": "https://...",
      "posted_at": "2024-01-01T00:00:00Z",
      "like_count": 100,
      "view_count": 1000,
      "remix_count": 5,
      "attachment": {
        "kind": "video",
        "url": "https://...",
        "downloadable_url": "https://...",
        "width": 1280,
        "height": 720,
        "n_frames": 300,
        "duration_seconds": 10.0,
        "thumbnail_url": "https://..."
      },
      "author": {
        "user_id": "user-xxx",
        "username": "john_doe",
        "display_name": "John Doe",
        "profile_picture_url": "https://...",
        "verified": false,
        "follower_count": 100
      }
    }
  ]
}
```

---

### GET /v1/tokens/{token_id}/pending-tasks

获取指定 Token 的待处理任务（v1 版本）。

**路径参数:**
- `token_id`: Token ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/tokens/1/pending-tasks" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "token_id": 1,
  "count": 2,
  "tasks": [
    {
      "id": "task_xxx",
      "status": "running",
      "prompt": "A cat walking",
      "progress_pct": 0.5
    }
  ]
}
```

---

### GET /v1/tokens/{token_id}/pending-tasks-v2

获取指定 Token 的待处理任务（v2 版本）。

**路径参数:**
- `token_id`: Token ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/tokens/1/pending-tasks-v2" \
  -H "Authorization: Bearer your-api-key"
```

---

### GET /v1/tokens/{token_id}/tasks/{task_id}

获取任务进度。

**路径参数:**
- `token_id`: Token ID
- `task_id`: 任务 ID

**请求示例:**
```bash
curl -X GET "http://your-server/v1/tokens/1/tasks/task_xxx" \
  -H "Authorization: Bearer your-api-key"
```

**响应示例:**
```json
{
  "success": true,
  "task": {
    "id": "task_xxx",
    "status": "running",
    "prompt": "A cat walking",
    "title": "Video Generation",
    "progress_pct": 0.75,
    "generations": []
  }
}
```

---

### GET /v1/tokens/{token_id}/profile-feed

获取指定 Token 的个人发布作品。

**路径参数:**
- `token_id`: Token ID

**查询参数:**
- `limit` (可选): 返回数量，默认 8

**请求示例:**
```bash
curl -X GET "http://your-server/v1/tokens/1/profile-feed?limit=10" \
  -H "Authorization: Bearer your-api-key"
```

---

## 7. 管理接口

管理接口使用独立的认证方式，需要先登录获取管理员 Token。

### 7.1 认证接口

#### POST /api/login

管理员登录。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `username` | string | 是 | 管理员用户名 |
| `password` | string | 是 | 管理员密码 |

**请求示例:**
```bash
curl -X POST "http://your-server/api/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

**响应示例:**
```json
{
  "success": true,
  "token": "admin-xxxxxxxxxxxxxxxx",
  "message": "Login successful"
}
```

---

#### POST /api/logout

管理员登出。

**请求头:**
```
Authorization: Bearer admin-token
```

**响应示例:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 7.2 Token 管理接口

#### GET /api/tokens

获取所有 Token 列表。

**响应示例:**
```json
[
  {
    "id": 1,
    "token": "eyJhbGciOiJSUzI1NiI...",
    "st": "sess-xxx",
    "rt": "refresh-xxx",
    "client_id": "client-xxx",
    "proxy_url": "http://proxy:8080",
    "email": "user@example.com",
    "name": "User Name",
    "remark": "备注",
    "expiry_time": "2024-12-31T23:59:59",
    "is_active": true,
    "cooled_until": null,
    "created_at": "2024-01-01T00:00:00",
    "last_used_at": "2024-01-15T12:00:00",
    "use_count": 100,
    "image_count": 50,
    "video_count": 30,
    "error_count": 5,
    "plan_type": "chatgpt_team",
    "plan_title": "ChatGPT Business",
    "subscription_end": "2024-12-31T23:59:59",
    "sora2_supported": true,
    "sora2_invite_code": "ABC123",
    "sora2_redeemed_count": 5,
    "sora2_total_count": 10,
    "sora2_remaining_count": 5,
    "sora2_cooldown_until": null,
    "image_enabled": true,
    "video_enabled": true,
    "image_concurrency": -1,
    "video_concurrency": -1
  }
]
```

---

#### POST /api/tokens

添加新 Token。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `token` | string | 是 | Access Token (AT) |
| `st` | string | 否 | Session Token |
| `rt` | string | 否 | Refresh Token |
| `client_id` | string | 否 | Client ID |
| `proxy_url` | string | 否 | 代理 URL |
| `remark` | string | 否 | 备注 |
| `image_enabled` | boolean | 否 | 启用图片生成，默认 true |
| `video_enabled` | boolean | 否 | 启用视频生成，默认 true |
| `image_concurrency` | integer | 否 | 图片并发限制，-1 表示不限制 |
| `video_concurrency` | integer | 否 | 视频并发限制，-1 表示不限制 |

**请求示例:**
```bash
curl -X POST "http://your-server/api/tokens" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJSUzI1NiI...",
    "st": "sess-xxx",
    "rt": "refresh-xxx",
    "remark": "测试账号",
    "image_enabled": true,
    "video_enabled": true
  }'
```

**响应示例:**
```json
{
  "success": true,
  "message": "Token 添加成功",
  "token_id": 1
}
```

---

#### POST /api/tokens/batch-add

批量添加 Token。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `tokens` | array | 是 | Token 数组 |

**Token 对象:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `token` | string | 是 | Access Token |
| `st` | string | 否 | Session Token |
| `rt` | string | 否 | Refresh Token |
| `client_id` | string | 否 | Client ID |
| `proxy_url` | string | 否 | 代理 URL |
| `remark` | string | 否 | 备注 |
| `image_enabled` | boolean | 否 | 启用图片生成 |
| `video_enabled` | boolean | 否 | 启用视频生成 |
| `image_concurrency` | integer | 否 | 图片并发限制 |
| `video_concurrency` | integer | 否 | 视频并发限制 |

**请求示例:**
```bash
curl -X POST "http://your-server/api/tokens/batch-add" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "tokens": [
      {"token": "eyJhbGciOiJSUzI1NiI...", "remark": "账号1"},
      {"token": "eyJhbGciOiJSUzI1NiI...", "remark": "账号2"}
    ]
  }'
```

**响应示例:**
```json
{
  "success": true,
  "added": 2,
  "skipped": 0,
  "failed": 0,
  "details": [
    {"token": "eyJhbGciOiJSUzI1...", "status": "added", "token_id": 1},
    {"token": "eyJhbGciOiJSUzI1...", "status": "added", "token_id": 2}
  ]
}
```

---

#### PUT /api/tokens/{token_id}

更新 Token。

**路径参数:**
- `token_id`: Token ID

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `token` | string | 否 | Access Token |
| `st` | string | 否 | Session Token |
| `rt` | string | 否 | Refresh Token |
| `client_id` | string | 否 | Client ID |
| `proxy_url` | string | 否 | 代理 URL |
| `remark` | string | 否 | 备注 |
| `image_enabled` | boolean | 否 | 启用图片生成 |
| `video_enabled` | boolean | 否 | 启用视频生成 |
| `image_concurrency` | integer | 否 | 图片并发限制 |
| `video_concurrency` | integer | 否 | 视频并发限制 |

---

#### PUT /api/tokens/{token_id}/status

更新 Token 状态。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `is_active` | boolean | 是 | 是否启用 |

---

#### POST /api/tokens/{token_id}/enable

启用 Token 并重置错误计数。

---

#### POST /api/tokens/{token_id}/disable

禁用 Token。

---

#### POST /api/tokens/{token_id}/test

测试 Token 有效性并刷新 Sora2 信息。

**响应示例:**
```json
{
  "success": true,
  "status": "success",
  "message": "Token is valid",
  "email": "user@example.com",
  "username": "john_doe",
  "sora2_supported": true,
  "sora2_invite_code": "ABC123",
  "sora2_redeemed_count": 5,
  "sora2_total_count": 10,
  "sora2_remaining_count": 5
}
```

---

#### DELETE /api/tokens/{token_id}

删除 Token。

---

#### DELETE /api/tokens/batch-delete-disabled

批量删除所有禁用的 Token。

---

#### POST /api/tokens/batch-test

批量测试 Token。

**查询参数:**
- `only_active` (可选): 仅测试启用的 Token，默认 true
- `only_disabled` (可选): 仅测试禁用的 Token，默认 false

**响应示例:**
```json
{
  "success": true,
  "message": "测试完成: 8 有效, 2 无效, 2 已自动禁用, 0 已自动启用",
  "valid": 8,
  "invalid": 2,
  "auto_disabled": 2,
  "auto_enabled": 0
}
```

---

#### POST /api/tokens/batch-enable

批量启用所有禁用的 Token。

---

#### POST /api/tokens/batch-disable

批量禁用所有启用的 Token。

---

#### POST /api/tokens/batch-activate

批量激活 Sora2。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `invite_code` | string | 是 | 6 位邀请码 |

**响应示例:**
```json
{
  "success": true,
  "message": "批量激活完成: 5 激活, 3 已激活, 2 失败",
  "activated": 5,
  "already_active": 3,
  "failed": 2
}
```

---

#### POST /api/tokens/import

导入 Token（追加模式，存在则更新）。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `tokens` | array | 是 | Token 数组 |

**Token 对象:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `email` | string | 是 | 邮箱（主键） |
| `access_token` | string | 是 | Access Token |
| `session_token` | string | 否 | Session Token |
| `refresh_token` | string | 否 | Refresh Token |
| `proxy_url` | string | 否 | 代理 URL |
| `remark` | string | 否 | 备注 |
| `is_active` | boolean | 否 | 是否启用 |
| `image_enabled` | boolean | 否 | 启用图片生成 |
| `video_enabled` | boolean | 否 | 启用视频生成 |
| `image_concurrency` | integer | 否 | 图片并发限制 |
| `video_concurrency` | integer | 否 | 视频并发限制 |

---

#### POST /api/tokens/st2at

Session Token 转 Access Token（仅转换，不入库）。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `st` | string | 是 | Session Token |

**响应示例:**
```json
{
  "success": true,
  "message": "ST converted to AT successfully",
  "access_token": "eyJhbGciOiJSUzI1NiI...",
  "email": "user@example.com",
  "expires": "2024-01-15T12:00:00"
}
```

---

#### POST /api/tokens/rt2at

Refresh Token 转 Access Token（仅转换，不入库）。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `rt` | string | 是 | Refresh Token |

**响应示例:**
```json
{
  "success": true,
  "message": "RT converted to AT successfully",
  "access_token": "eyJhbGciOiJSUzI1NiI...",
  "refresh_token": "new-refresh-token",
  "expires_in": 3600
}
```

---

### 7.3 配置管理接口

#### GET /api/admin/config

获取管理员配置。

**响应示例:**
```json
{
  "error_ban_threshold": 3,
  "api_key": "your-api-key",
  "admin_username": "admin",
  "debug_enabled": false
}
```

---

#### POST /api/admin/config

更新管理员配置。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `error_ban_threshold` | integer | 是 | 错误禁用阈值 |

---

#### POST /api/admin/password

更新管理员密码。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `old_password` | string | 是 | 旧密码 |
| `new_password` | string | 是 | 新密码 |
| `username` | string | 否 | 新用户名 |

---

#### POST /api/admin/apikey

更新 API Key。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `new_api_key` | string | 是 | 新 API Key |

---

#### POST /api/admin/debug

更新调试配置。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `enabled` | boolean | 是 | 是否启用调试模式 |

---

### 7.4 代理配置接口

#### GET /api/proxy/config

获取代理配置。

**响应示例:**
```json
{
  "proxy_enabled": true,
  "proxy_url": "http://proxy:8080",
  "proxy_pool_enabled": false,
  "proxy_pool_count": 10
}
```

---

#### POST /api/proxy/config

更新代理配置。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `proxy_enabled` | boolean | 是 | 是否启用代理 |
| `proxy_url` | string | 否 | 代理 URL |
| `proxy_pool_enabled` | boolean | 否 | 是否启用代理池 |

---

### 7.5 缓存配置接口

#### GET /api/cache/config

获取缓存配置。

**响应示例:**
```json
{
  "success": true,
  "config": {
    "enabled": true,
    "timeout": 7200,
    "base_url": "https://yourdomain.com",
    "effective_base_url": "https://yourdomain.com"
  }
}
```

---

#### POST /api/cache/config

更新缓存超时时间。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `timeout` | integer | 是 | 缓存超时时间（秒），60-86400 |

---

#### POST /api/cache/base-url

更新缓存基础 URL。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `base_url` | string | 是 | 基础 URL |

---

#### POST /api/cache/enabled

更新缓存启用状态。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `enabled` | boolean | 是 | 是否启用缓存 |

---

### 7.6 生成超时配置接口

#### GET /api/generation/timeout

获取生成超时配置。

**响应示例:**
```json
{
  "success": true,
  "config": {
    "image_timeout": 300,
    "video_timeout": 1500
  }
}
```

---

#### POST /api/generation/timeout

更新生成超时配置。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `image_timeout` | integer | 否 | 图片生成超时（秒），60-3600 |
| `video_timeout` | integer | 否 | 视频生成超时（秒），60-7200 |

---

### 7.7 去水印配置接口

#### GET /api/watermark-free/config

获取去水印配置。

**响应示例:**
```json
{
  "watermark_free_enabled": true,
  "parse_method": "third_party",
  "custom_parse_url": null,
  "custom_parse_token": null
}
```

---

#### POST /api/watermark-free/config

更新去水印配置。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `watermark_free_enabled` | boolean | 是 | 是否启用去水印 |
| `parse_method` | string | 否 | 解析方式：`third_party` 或 `custom` |
| `custom_parse_url` | string | 否 | 自定义解析 URL |
| `custom_parse_token` | string | 否 | 自定义解析 Token |

---

### 7.8 Cloudflare Solver 配置接口

#### GET /api/cloudflare/config

获取 Cloudflare Solver 配置。

**响应示例:**
```json
{
  "success": true,
  "config": {
    "solver_enabled": true,
    "solver_api_url": "http://localhost:8000/v1/challenge"
  }
}
```

---

#### POST /api/cloudflare/config

更新 Cloudflare Solver 配置。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `solver_enabled` | boolean | 是 | 是否启用 Solver |
| `solver_api_url` | string | 否 | Solver API URL |

---

#### GET /api/cloudflare/state

获取 Cloudflare 凭据状态。

---

#### POST /api/cloudflare/refresh

手动刷新 Cloudflare 凭据。

---

#### POST /api/cloudflare/clear

清除 Cloudflare 凭据。

---

### 7.9 Token 刷新配置接口

#### GET /api/token-refresh/config

获取 AT 自动刷新配置。

**响应示例:**
```json
{
  "success": true,
  "config": {
    "at_auto_refresh_enabled": true
  }
}
```

---

#### POST /api/token-refresh/enabled

更新 AT 自动刷新状态。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `enabled` | boolean | 是 | 是否启用自动刷新 |

---

### 7.10 统计与日志接口

#### GET /api/stats

获取系统统计信息。

**响应示例:**
```json
{
  "total_tokens": 10,
  "active_tokens": 8,
  "total_images": 1000,
  "total_videos": 500,
  "today_images": 50,
  "today_videos": 20,
  "total_errors": 50,
  "today_errors": 2
}
```

---

#### GET /api/logs

获取最近日志。

**查询参数:**
- `limit` (可选): 返回数量，默认 100

**响应示例:**
```json
[
  {
    "id": 1,
    "token_id": 1,
    "token_email": "user@example.com",
    "token_username": "john_doe",
    "operation": "video_generation",
    "status_code": 200,
    "duration": 120.5,
    "created_at": "2024-01-15T12:00:00",
    "request_body": "{...}",
    "response_body": "{...}",
    "task_id": "task_xxx",
    "progress": 100,
    "task_status": "completed"
  }
]
```

---

### 7.11 Sora2 激活接口

#### POST /api/tokens/{token_id}/sora2/activate

激活 Sora2。

**路径参数:**
- `token_id`: Token ID

**查询参数:**
- `invite_code`: 6 位邀请码

**响应示例:**
```json
{
  "success": true,
  "message": "Sora2 activated successfully",
  "already_accepted": false,
  "invite_code": "ABC123",
  "redeemed_count": 0,
  "total_count": 10,
  "sora2_remaining_count": 10
}
```

---

### 7.12 用户名激活接口

#### POST /api/tokens/{token_id}/activate-username

为 Token 激活用户名（自动生成并设置）。

**路径参数:**
- `token_id`: Token ID

**响应示例:**
```json
{
  "success": true,
  "message": "用户名设置成功: random_user_123",
  "username": "random_user_123",
  "already_set": false
}
```

---

#### POST /api/tokens/batch-activate-username

批量激活所有活跃 Token 的用户名。

**响应示例:**
```json
{
  "success": true,
  "activated": 5,
  "already_set": 3,
  "failed": 2,
  "total": 10
}
```

---

### 7.13 角色管理接口

#### GET /api/characters

获取所有角色列表。

**响应示例:**
```json
{
  "success": true,
  "characters": [
    {
      "id": 1,
      "cameo_id": "ch_xxx",
      "character_id": "char_xxx",
      "token_id": 1,
      "username": "my_character",
      "display_name": "My Character",
      "profile_url": "https://...",
      "instruction_set": "...",
      "safety_instruction_set": "...",
      "visibility": "private",
      "status": "finalized",
      "created_at": "2024-01-15T12:00:00",
      "updated_at": "2024-01-15T12:00:00"
    }
  ]
}
```

---

#### GET /api/characters/by-token/{token_id}

获取指定 Token 的角色列表。

---

#### GET /api/characters/{cameo_id}

获取角色详情。

---

#### POST /api/characters/{cameo_id}/update

更新角色指令集。

**请求参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `instruction_set` | string | 否 | 角色指令集 |
| `safety_instruction_set` | string | 否 | 安全指令集 |
| `visibility` | string | 否 | 可见性：`private` 或 `public` |

---

#### DELETE /api/characters/{cameo_id}

删除角色（仅从数据库删除，不从 Sora 删除）。

---

## 错误响应

所有接口在发生错误时返回统一的错误格式：

**HTTP 错误响应:**
```json
{
  "detail": "Error message"
}
```

**OpenAI 兼容错误格式:**
```json
{
  "error": {
    "message": "Error message",
    "type": "server_error",
    "param": null,
    "code": null
  }
}
```

**常见 HTTP 状态码:**

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如 Token 已存在） |
| 500 | 服务器内部错误 |

---

## 数据模型

### Token 模型

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | integer | Token ID |
| `token` | string | Access Token |
| `email` | string | 邮箱 |
| `username` | string | 用户名 |
| `name` | string | 名称 |
| `st` | string | Session Token |
| `rt` | string | Refresh Token |
| `client_id` | string | Client ID |
| `proxy_url` | string | 代理 URL |
| `remark` | string | 备注 |
| `expiry_time` | datetime | 过期时间 |
| `is_active` | boolean | 是否启用 |
| `cooled_until` | datetime | 冷却截止时间 |
| `created_at` | datetime | 创建时间 |
| `last_used_at` | datetime | 最后使用时间 |
| `use_count` | integer | 使用次数 |
| `plan_type` | string | 账户类型 |
| `plan_title` | string | 套餐名称 |
| `subscription_end` | datetime | 套餐到期时间 |
| `sora2_supported` | boolean | 是否支持 Sora2 |
| `sora2_invite_code` | string | Sora2 邀请码 |
| `sora2_redeemed_count` | integer | Sora2 已用次数 |
| `sora2_total_count` | integer | Sora2 总次数 |
| `sora2_remaining_count` | integer | Sora2 剩余次数 |
| `sora2_cooldown_until` | datetime | Sora2 冷却时间 |
| `image_enabled` | boolean | 是否启用图片生成 |
| `video_enabled` | boolean | 是否启用视频生成 |
| `image_concurrency` | integer | 图片并发限制 |
| `video_concurrency` | integer | 视频并发限制 |

### Task 模型

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | integer | 任务 ID |
| `task_id` | string | 任务标识 |
| `token_id` | integer | 关联 Token ID |
| `model` | string | 使用的模型 |
| `prompt` | string | 提示词 |
| `status` | string | 状态：processing/completed/failed |
| `progress` | float | 进度 (0.0-100.0) |
| `result_urls` | string | 结果 URL (JSON 数组) |
| `error_message` | string | 错误信息 |
| `created_at` | datetime | 创建时间 |
| `completed_at` | datetime | 完成时间 |

### Character 模型

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | integer | 角色 ID |
| `cameo_id` | string | Sora cameo ID |
| `character_id` | string | Sora character ID |
| `token_id` | integer | 关联 Token ID |
| `username` | string | 角色用户名 |
| `display_name` | string | 显示名称 |
| `profile_url` | string | 头像 URL |
| `instruction_set` | string | 指令集 (JSON) |
| `safety_instruction_set` | string | 安全指令集 (JSON) |
| `visibility` | string | 可见性：private/public |
| `status` | string | 状态：processing/finalized/deleted |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

---

## 附录

### 配置文件示例 (setting.toml)

```toml
[global]
api_key = "your-api-key"
admin_username = "admin"
admin_password = "your-password"

[server]
host = "0.0.0.0"
port = 8000

[sora]
base_url = "https://sora.chatgpt.com"
timeout = 30
max_retries = 3
poll_interval = 2.0
max_poll_attempts = 300

[generation]
image_timeout = 300
video_timeout = 1500

[cache]
enabled = true
timeout = 7200
base_url = ""

[proxy]
enabled = false
url = ""
pool_enabled = false

[watermark_free]
watermark_free_enabled = false
parse_method = "third_party"
custom_parse_url = ""
custom_parse_token = ""

[cloudflare]
enabled = false
api_url = "http://localhost:8000"

[token_refresh]
at_auto_refresh_enabled = false

[database]
type = "sqlite"
sqlite_path = "data/hancat.db"

[redis]
enabled = false
host = "localhost"
port = 6379
password = ""
db = 0

[debug]
enabled = false
log_requests = true
log_responses = true
mask_token = true
```

---

*文档版本: 1.0.0*
*最后更新: 2026-01-05*
