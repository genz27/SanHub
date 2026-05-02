# 图像生成 API 使用指南

本文档介绍当前对外的图像生成接口，包括 Google 原生格式与 OpenAI 兼容格式。

## 接口概览

| 接口 | 方法 | 格式 | 说明 |
| --- | --- | --- | --- |
| `/v1beta/models/{model}:generateContent` | `POST` | Google 原生 | 推荐，Gemini 原生格式，支持图生图、参数控制 |
| `/v1/chat/completions` | `POST` | OpenAI | 对话格式生成图像，支持最多 3 张参考图 |
| `/v1/images/generations` | `POST` | OpenAI | 图像格式生成图像，支持 1 张参考图 |
| `/v1/images/edits` | `POST` | OpenAI / multipart | 编辑接口，支持文件上传参考图 |
| `/v1/edits` | `POST` | OpenAI / multipart | `/v1/images/edits` 的别名 |
| `/v1/videos` | `POST` | OpenAI / NewAPI Sora | Sora2 视频生成，支持 1 张首帧参考图 |
| `/v1/videos/{id}` | `GET` | OpenAI / NewAPI Sora | 查询视频任务状态 |
| `/v1/videos/{id}/content` | `GET` | OpenAI / NewAPI Sora | 获取生成视频内容 |

## 基础配置

```bash
API_BASE_URL="https://www.apexerapi.top"
API_KEY="YOUR_API_KEY"
```

所有接口都需要携带 Bearer Token：

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

系统开启 S3 缓存模式时，服务端会先把上游图片/视频缓存到 S3，缓存成功后才返回结果；接口只返回 `/cache/s3?key=...` 或配置的公开 Base URL 下的缓存地址，不会把官方原始图片/视频地址暴露给客户端。

## 模型说明

### Gemini / Nano Banana 系列

⚠️ **适配状态：已适配** — 以下模型均已实现完整参数支持

Nano Banana 系列是 Google Gemini 3 代原生图像生成模型：

| 模型名 | 系列 | 分辨率 | 适用场景 |
| --- | --- | --- | --- |
| `gemini-3-pro-image-preview` | Nano Banana Pro | 1K / 2K / 4K | 广告图、产品图、高精度插画、海报 |
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | 512(0.5K) / 1K / 2K / 4K | 社交媒体配图、快速草稿、高清输出 |
| `nano-banana-pro` | Nano Banana Pro 别名 | 1K / 2K / 4K | 与 `gemini-3-pro-image-preview` 相同 |
| `nano-banana-2` | Nano Banana 2 别名 | 512(0.5K) / 1K / 2K / 4K | 与 `gemini-3.1-flash-image-preview` 相同 |

> **2026-02-26 更新**：Nano Banana 2 正式发布，新增 0.5K(512px) 分辨率支持，新增 8:1、4:1、1:4、1:8 超宽/超长比例，新增 Image Search Grounding 联网图像搜索能力。

兼容旧模型名：`gemini_3.0_pro_image_preview`、`gemini_3.0_pro_image_preview_4K`、`gemini_3.1_flash_image_preview`、`gemini_3.1_flash_image_preview_4K`。带 `_4K`、`:4k`、`-4k` 的别名会自动使用 `imageSize: "4K"`。

也兼容旧版 `gemini-2.5-flash-image`（第一代 Nano Banana）及其别名 `nano-banana`。

### GPT Image 系列

| 模型名 | 系列 | 分辨率 | 适用场景 |
| --- | --- | --- | --- |
| `gpt-image-2` | GPT Image 2 | 1K / 2K / 4K | 高质量创意图、插画、概念设计 |

### Sora 视频系列

| 模型名 | 系列 | 分辨率 | 时长 | 消耗 |
| --- | --- | --- | --- | --- |
| `sora-2` | Sora 2 | `720x1280` / `1280x720` | `12` / `16` / `20` 秒 | 96 credits / 次 |

## 参数说明

### Gemini / Nano Banana 系列参数

`aspect_ratio` / `aspectRatio`：

| 值 | 比例 | 适用场景 |
| --- | --- | --- |
| `Default` | Nano Banana 2 默认 | 文生图按 `1:1`，图生图尽量跟随参考图 |
| `auto` | Nano Banana Pro 默认 | 文生图自动，图生图尽量跟随参考图 |
| `8:1` | 超宽横幅，仅 Nano Banana 2 | 长条横幅、全景 Banner |
| `4:1` | 宽横幅，仅 Nano Banana 2 | 网站头图、横向展板 |
| `21:9` | 影院宽幅 | 电影感海报、超宽封面 |
| `16:9` | 横屏宽幅 | YouTube 封面、桌面壁纸 |
| `5:4` | 近方形横向 | 产品图、版式设计 |
| `4:3` | 标准横屏 | 博客配图、幻灯片 |
| `3:2` | 摄影横构图 | 摄影、广告图 |
| `1:1` | 正方形 | 头像、产品主图 |
| `2:3` | 摄影竖构图 | 人像、竖版海报 |
| `3:4` | 标准竖屏 | 杂志封面、竖版海报 |
| `4:5` | 社媒竖图 | Instagram 风格海报 |
| `9:16` | 竖屏纵向 | 手机壁纸、短视频封面 |
| `1:4` | 竖向长条，仅 Nano Banana 2 | 长图、竖向展示条 |
| `1:8` | 超长竖图，仅 Nano Banana 2 | 超长海报、竖向 Banner |

`image_size` / `imageSize`：

| 值 | 说明 |
| --- | --- |
| `512` / `0.5K` | Nano Banana 2 小图尺寸，约 512px 短边 |
| `1K` | 标准清晰度，默认 |
| `2K` | 高清晰度 |
| `4K` | 超高清，Nano Banana Pro / Nano Banana 2 均支持 |

Nano Banana Pro 支持的比例：`auto`、`1:1`、`21:9`、`16:9`、`3:2`、`4:3`、`5:4`、`4:5`、`3:4`、`2:3`、`9:16`。

Nano Banana 2 支持的比例：`Default`、`8:1`、`4:1`、`21:9`、`16:9`、`5:4`、`4:3`、`3:2`、`1:1`、`2:3`、`3:4`、`4:5`、`9:16`、`1:4`、`1:8`。

#### 联网生成 / Image Search Grounding

支持两种写法：

1. Gemini 原生风格：`tools: [{"google_search": {}}]`
2. 快捷参数：`enable_web_search: true` / `enableWebSearch: true`

Nano Banana 2 额外支持 **Image Search Grounding**（图像搜索联网），生成时可结合 Google 搜索中的图文结果，更适合需要最新信息或参考真实图片的场景。

#### 背景 / 输出格式

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `background` | string | `opaque`（不透明，默认）或 `transparent`（透明背景，部分模型支持） |
| `output_format` | string | `png`（默认）、`jpeg`、`webp` |
| `output_compression` | int | 输出图片压缩等级（仅部分模型/格式支持） |

#### 参考图限制

官方 API 支持单次最多 **14 张**参考图，本代理当前限制为 **3 张**以控制账号消耗。

#### 多轮编辑

Nano Banana 系列支持多轮对话式编辑。在 `/v1/chat/completions` 中传入多轮 `messages`（包含历史和新的参考图），即可实现基于对话的连续修图。

### GPT Image 2 参数

`size` 用于指定像素尺寸：

| 值 | 说明 | 适用场景 |
| --- | --- | --- |
| `auto` | 自动选择尺寸，默认 | 通用场景，图生图时跟随原图 |
| `1024x1024` | 1K 正方形 | 头像、产品主图 |
| `1536x1024` | 1K 横屏 | 风景图、横版海报 |
| `1024x1536` | 1K 竖屏 | 人像、竖版海报 |
| `2048x2048` | 2K 正方形 | 高清产品图、社交媒体 |
| `2048x1152` | 2K 横屏 | 高清风景、桌面壁纸 |
| `3840x2160` | 4K 横屏 | 海报、印刷品 |
| `2160x3840` | 4K 竖屏 | 竖版海报、展览素材 |

OpenAI 格式参数路径：`extra_body.google.image_config.size`
Gemini 格式参数路径：`generationConfig.imageConfig.size`

`image_size` / `imageSize` 用于控制画质：

| 值 | 说明 |
| --- | --- |
| `low` | 低画质，生成速度最快 |
| `medium` | 中等画质，默认，推荐日常使用 |
| `high` | 高画质，细节最丰富，生成速度较慢 |

GPT Image 2 的 `image_size` 控制画质精细度，不改变输出像素尺寸；像素尺寸由 `size` 控制。

### Sora2 视频参数

`/v1/videos` 同时兼容 JSON 和 multipart/form-data。参考图字段支持 URL、data URI、纯 base64，也支持 multipart 文件上传。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 否 | 仅支持 `sora-2`，默认 `sora-2` |
| `prompt` | string | 是 | 视频描述 |
| `size` | string | 否 | 如 `720x1280` 或 `1280x720`；也可传 `width` + `height` |
| `seconds` | string / number | 否 | 支持 `12`、`16`、`20` 秒 |
| `duration` | string / number | 否 | NewAPI 风格时长字段，等价于 `seconds` |
| `image` | string / file | 否 | 首帧参考图 URL、data URI、base64 或 multipart 文件 |
| `input_reference` | string / object / file | 否 | OpenAI Sora 风格首帧参考图，支持 `{ "image_url": { "url": "..." } }` |

任务创建后返回 `id` / `task_id`。轮询 `/v1/videos/{id}`，状态为 `completed` 后使用返回的 `url` / `video_url`，或直接请求 `/v1/videos/{id}/content` 获取视频。S3 缓存模式下，`url` / `video_url` 和 `/content` 跳转目标都是 S3 缓存地址，不暴露原始视频地址。

兼容别名：`POST /v1/video/generations`、`GET /v1/video/generations/{id}`、`GET /v1/video/generations/{id}/content`。

## 接口一：POST /v1beta/models/{model}:generateContent

⚠️ **适配状态：已适配** — 所有参数完整支持

Google 原生格式，支持所有模型。请求和响应均使用 camelCase，例如 `inlineData`、`mimeType`、`aspectRatio`、`imageSize`。

### 接口定义

```http
POST https://www.apexerapi.top/v1beta/models/{model}:generateContent
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

路径示例：

```text
/v1beta/models/gemini-3.1-flash-image-preview:generateContent
/v1beta/models/gemini-3-pro-image-preview:generateContent
/v1beta/models/gemini_3.1_flash_image_preview:generateContent
/v1beta/models/gpt-image-2:generateContent
```

### 入参

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `contents` | array | 是 | 消息数组 |
| `contents[].role` | string | 是 | 固定 `user` |
| `contents[].parts` | array | 是 | 消息内容块 |
| `contents[].parts[].text` | string | 文本时必填 | 图像描述 prompt |
| `contents[].parts[].inlineData.mimeType` | string | 图片时必填 | `image/jpeg` 或 `image/png` |
| `contents[].parts[].inlineData.data` | string | 图片时必填 | 图片 base64 数据，不含 `data:image/...;base64,` 前缀 |
| `contents[].parts[].fileData.fileUri` | string | 否 | 参考图 URL |
| `generationConfig.responseModalities` | array | 否 | 建议传 `["TEXT", "IMAGE"]` |
| `generationConfig.responseMimeType` | string | 否 | 输出 MIME 类型，如 `image/jpeg`、`image/webp`、`image/png` |
| `generationConfig.candidateCount` | int | 否 | 生成图片数量（等效于 `n`） |
| `generationConfig.imageConfig.aspectRatio` | string | 否 | 宽高比；Nano Banana 2 支持 `Default` 和超宽/超长比例，Pro 支持 `auto` |
| `generationConfig.imageConfig.imageSize` | string | 否 | Nano Banana 2: `512` / `0.5K` / `1K` / `2K` / `4K`；Nano Banana Pro: `1K` / `2K` / `4K`；GPT Image 2: `low` / `medium` / `high` |
| `generationConfig.imageConfig.size` | string | 否 | 仅 GPT Image 2：直接指定像素尺寸，如 `2048x2048`，优先级高于 `aspectRatio` |
| `generationConfig.imageConfig.enableWebSearch` | boolean | 否 | Nano Banana Pro / Nano Banana 2 是否启用联网生成 |
| `tools[].google_search` | object | 否 | Google 原生联网生成写法，等价于 `enableWebSearch: true` |

### 出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `candidates[0].content.parts[0].inlineData.mimeType` | string | `image/png` |
| `candidates[0].content.parts[0].inlineData.data` | string | base64 编码的图像数据 |

### 请求示例：Gemini 文生图

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "A breathtaking landscape at sunset"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

### 请求示例：GPT Image 2 文生图

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "A cute fluffy orange cat sitting on a windowsill"
        }
      ]
    }
  ],
  "generationConfig": {
    "imageConfig": {
      "size": "2048x2048",
      "imageSize": "high"
    }
  }
}
```

### 请求示例：Nano Banana 2 超长竖图

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "A futuristic vertical exhibition banner for a robotics expo"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "1:8",
      "imageSize": "4K",
      "enableWebSearch": false
    }
  }
}
```

请求路径：

```text
/v1beta/models/gemini-3.1-flash-image-preview:generateContent
```

### 请求示例：图生图

```bash
IMAGE_B64=$(base64 -i ref.jpg | tr -d '\n')

curl -X POST "https://www.apexerapi.top/v1beta/models/gemini_3.1_flash_image_preview:generateContent" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [
      {
        \"role\": \"user\",
        \"parts\": [
          {
            \"inlineData\": {
              \"mimeType\": \"image/jpeg\",
              \"data\": \"${IMAGE_B64}\"
            }
          },
          {
            \"text\": \"Transform into watercolor painting style\"
          }
        ]
      }
    ],
    \"generationConfig\": {
      \"responseModalities\": [\"TEXT\", \"IMAGE\"],
      \"imageConfig\": {
        \"aspectRatio\": \"16:9\",
        \"imageSize\": \"1K\"
      }
    }
  }"
```

### 响应示例

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "iVBORw0KGgo..."
            }
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0
    }
  ]
}
```

## 接口二：POST /v1/chat/completions

⚠️ **适配状态：已适配** — 完整支持，参考图限制 3 张（官方上限 14 张）

OpenAI 兼容对话格式，适合接入 OpenAI SDK 或兼容客户端。参考图片最多传 3 张，放在 `messages[].content[]` 中 `type=image_url` 的条目里。

### 接口定义

```http
POST https://www.apexerapi.top/v1/chat/completions
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

### 入参

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 是 | 模型名 |
| `messages` | array | 是 | 消息数组，支持多轮对话 |
| `messages[].content[].type` | string | 是 | `text` 或 `image_url` |
| `messages[].content[].text` | string | 文本时必填 | 图像描述 prompt |
| `messages[].content[].image_url.url` | string | 图片时必填 | 图片 URL、base64 或 `data:image/...;base64,...` |
| `extra_body.google.image_config.aspect_ratio` | string | 否 | 宽高比；Nano Banana 2 支持 `Default`、`8:1`、`4:1`、`1:4`、`1:8` 等网页比例 |
| `extra_body.google.image_config.image_size` | string | 否 | Nano Banana 2: `512` / `0.5K` / `1K` / `2K` / `4K`；Nano Banana Pro: `1K` / `2K` / `4K`；GPT Image 2: `low` / `medium` / `high` |
| `extra_body.google.image_config.size` | string | 否 | 仅 GPT Image 2：直接指定像素尺寸 |
| `extra_body.google.image_config.enable_web_search` | boolean | 否 | Nano Banana Pro / Nano Banana 2 是否启用联网生成 |
| `background` | string | 否 | `opaque`（默认）或 `transparent` |
| `output_format` | string | 否 | `png`（默认）、`jpeg`、`webp` |
| `output_compression` | int | 否 | 输出图片压缩等级 |

### 出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `choices[0].message.content[0].type` | string | `image_url` |
| `choices[0].message.content[0].image_url.url` | string | `data:image/png;base64,...` |
| `choices[0].finish_reason` | string | `stop` |

### 请求示例

```json
{
  "model": "gemini_3.1_flash_image_preview",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "A breathtaking landscape at sunset"
        }
      ]
    }
  ],
  "extra_body": {
    "google": {
      "image_config": {
        "aspect_ratio": "16:9",
        "image_size": "2K"
      }
    }
  }
}
```

### 请求示例：图生图

```json
{
  "model": "gemini_3.1_flash_image_preview",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/ref.jpg"
          }
        },
        {
          "type": "text",
          "text": "Transform into watercolor painting style"
        }
      ]
    }
  ],
  "extra_body": {
    "google": {
      "image_config": {
        "aspect_ratio": "16:9",
        "image_size": "1K"
      }
    }
  }
}
```

### 响应示例

```json
{
  "id": "chatcmpl_abc123",
  "object": "chat.completion",
  "created": 1773161569,
  "model": "gemini_3.1_flash_image_preview",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": [
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,iVBORw0KGgo..."
            }
          }
        ]
      },
      "finish_reason": "stop"
    }
  ]
}
```

## 接口三：POST /v1/images/generations

⚠️ **适配状态：已适配** — 完整支持

OpenAI 图像生成格式。`image` 字段可传参考图 URL、base64 或 data URI，最多 1 张。

### 接口定义

```http
POST https://www.apexerapi.top/v1/images/generations
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

### 入参

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 是 | 模型名 |
| `prompt` | string | 是 | 图像描述文本 |
| `image` | string | 否 | 参考图 URL、base64 或 data URI，最多 1 张 |
| `response_format` | string | 否 | 返回格式：`url` 或 `b64_json`，默认 `url` |
| `background` | string | 否 | `opaque`（默认）或 `transparent` |
| `output_format` | string | 否 | `png`（默认）、`jpeg`、`webp` |
| `output_compression` | int | 否 | 输出图片压缩等级 |
| `extra_body.google.image_config.aspect_ratio` | string | 否 | 宽高比 |
| `extra_body.google.image_config.image_size` | string | 否 | 画质/分辨率 |
| `extra_body.google.image_config.size` | string | 否 | 仅 GPT Image 2：直接指定像素尺寸 |
| `extra_body.google.image_config.enable_web_search` | boolean | 否 | 联网生成 |

### 出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `created` | integer | 生成完成时间戳 |
| `data[0].url` | string | 默认返回的图片访问地址，S3 模式下为 S3 缓存地址 |
| `data[0].b64_json` | string | 当 `response_format=b64_json` 时返回 base64 编码的图像数据 |

### 请求示例：Gemini 文生图

```json
{
  "model": "gemini_3.1_flash_image_preview",
  "prompt": "A cute orange cat sitting on a windowsill",
  "extra_body": {
    "google": {
      "image_config": {
        "aspect_ratio": "1:1",
        "image_size": "1K"
      }
    }
  }
}
```

### 请求示例：GPT Image 2 文生图

```json
{
  "model": "gpt-image-2",
  "prompt": "一只橘猫戴着橙色围巾抱着水獭，温暖插画风格",
  "size": "3840x2160",
  "quality": "high",
  "output_format": "png",
  "n": 1
}
```

### 响应示例

```json
{
  "created": 1773161569,
  "background": "opaque",
  "data": [
    {
      "url": "https://gptimg2.lmmlm.com/cache/s3?key=image_xxx.png",
      "revised_prompt": "A cute orange cat sitting on a windowsill"
    }
  ],
  "output_format": "png",
  "quality": "medium",
  "size": "1024x1024"
}
```

当 `response_format=b64_json` 时：

```json
{
  "created": 1773161569,
  "background": "opaque",
  "data": [
    {
      "b64_json": "iVBORw0KGgo...",
      "revised_prompt": "A cute orange cat sitting on a windowsill"
    }
  ],
  "output_format": "png",
  "quality": "medium",
  "size": "1024x1024"
}
```

分辨率透传和常用合规尺寸见 `IMAGE_RESOLUTION_GUIDE.md`。

## 接口选择建议

| 场景 | 推荐接口 | 原因 |
| --- | --- | --- |
| 通用图像生成 | `/v1beta/models/{model}:generateContent` | Gemini 原生格式，参数控制最灵活，适合深度集成 |
| OpenAI 生态兼容 | `/v1/chat/completions` | OpenAI 兼容格式，支持 3 张参考图，SDK 生态完善 |
| 简单文生图，单张输出 | `/v1/images/generations` | 简洁专用，响应格式直接 |

## 参数速查

| 参数 | Nano Banana Pro | Nano Banana 2 | GPT Image 2 |
| --- | --- | --- | --- |
| 模型名 | `gemini-3-pro-image-preview` / `nano-banana-pro` | `gemini-3.1-flash-image-preview` / `nano-banana-2` | `gpt-image-2` |
| `aspect_ratio` 可选值 | `auto`、`1:1`、`21:9`、`16:9`、`3:2`、`4:3`、`5:4`、`4:5`、`3:4`、`2:3`、`9:16` | `Default`、`8:1`、`4:1`、`21:9`、`16:9`、`5:4`、`4:3`、`3:2`、`1:1`、`2:3`、`3:4`、`4:5`、`9:16`、`1:4`、`1:8` | `1:1`、`3:2`、`2:3`、`16:9`、`9:16`、`4:3`、`3:4`，也可直接传像素 `size` |
| `aspect_ratio` 默认值 | `auto` | `Default` | `1:1` |
| `size` 可选值 | 不推荐直接传，优先用 `aspect_ratio` + `image_size` | 不推荐直接传，优先用 `aspect_ratio` + `image_size` | `auto`、`1024x1024`、`1536x1024`、`1024x1536`、`2048x2048`、`2048x1152`、`3840x2160`、`2160x3840` |
| `image_size` 可选值 | `1K`、`2K`、`4K` | `512` / `0.5K`、`1K`、`2K`、`4K` | `low`、`medium`、`high` |
| `image_size` 默认值 | `1K` | `1K` | `medium` |
| OpenAI 参数路径 | `extra_body.google.image_config` | 同左 | 同左 |
| Gemini 参数路径 | `generationConfig.imageConfig` | 同左 | 同左 |
| 输出背景 | `background: opaque/transparent` | 同左 | 同左 |
| 输出格式 | `output_format: png/jpeg/webp` | 同左 | 同左 |
| 参考图上限（本代理） | 3 张 | 3 张 | 3 张 |
| 参考图上限（官方） | 14 张 | 14 张 | - |

## 已知问题

以下为官方模型当前存在的已知问题（2026-02 更新）：

| 问题 | 影响模型 | 说明 |
| --- | --- | --- |
| `imageSize` 被静默忽略 | `gemini-3-pro-image-preview` | Pro 模型始终返回 1K 分辨率，即使传 `imageSize: "4K"` |
| 编辑时 `aspectRatio` 被忽略 | `gemini-3.1-flash-image-preview` | 图生图/背景编辑操作时宽高比设置不生效 |
| 大小写敏感 | 所有 Gemini 模型 | `"1K"` 必须保持大写 `K`，传 `"1k"` 静默降级为 512px |

本代理已在代码层做了等价映射处理，会在传参给上游前做标准化，尽量规避上述问题。

## 错误响应

错误响应使用 OpenAI 风格：

```json
{
  "error": {
    "message": "错误信息",
    "type": "invalid_request_error",
    "param": null,
    "code": "bad_request"
  }
}
```

常见错误码：

| Code | 说明 |
| --- | --- |
| `invalid_api_key` | API Key 缺失或无效 |
| `bad_request` | 请求格式错误 |
| `too_many_references` | 参考图数量超过接口限制 |
| `unsupported_stream` | 当前不支持 `stream=true` |
| `no_available_account` | 没有余额足够或可用的账号 |
| `auth_refresh_failed` | RT 刷新 AT 失败 |
| `reference_failed` | 参考图解析或上传失败 |
| `upstream_failed` | 上游生成失败 |
| `cache_failed` | S3 缓存失败，服务端不会回退官方原始链接 |
| `image_download_failed` | 非 S3 模式下 base64 转换失败 |
