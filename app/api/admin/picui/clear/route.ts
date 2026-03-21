import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSystemConfig } from '@/lib/db';
import { fetch as undiciFetch } from 'undici';

interface PicUIImage {
  key: string;
  name: string;
}

interface PicUIListResponse {
  status: boolean;
  message: string;
  data?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    data: PicUIImage[];
  };
}

function resolvePicuiBucket(config: Awaited<ReturnType<typeof getSystemConfig>>) {
  const buckets = config.imageStorage?.buckets || [];
  const enabledBuckets = buckets.filter((bucket) => bucket.enabled);

  if (config.imageStorage?.defaultBucketId) {
    const defaultBucket = enabledBuckets.find(
      (bucket) => bucket.id === config.imageStorage.defaultBucketId
    );
    if (defaultBucket?.provider === 'picui' && defaultBucket.baseUrl && defaultBucket.apiKey) {
      return {
        baseUrl: defaultBucket.baseUrl,
        apiKey: defaultBucket.apiKey,
      };
    }
  }

  const firstPicuiBucket = enabledBuckets.find(
    (bucket) => bucket.provider === 'picui' && bucket.baseUrl && bucket.apiKey
  );
  if (firstPicuiBucket) {
    return {
      baseUrl: firstPicuiBucket.baseUrl,
      apiKey: firstPicuiBucket.apiKey,
    };
  }

  if (config.picuiBaseUrl && config.picuiApiKey) {
    return {
      baseUrl: config.picuiBaseUrl,
      apiKey: config.picuiApiKey,
    };
  }

  return null;
}

// POST /api/admin/picui/clear - 清空 PicUI 图床所有图片
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const config = await getSystemConfig();
    const picuiBucket = resolvePicuiBucket(config);
    if (!picuiBucket) {
      return NextResponse.json({ error: '未找到可用的 PicUI 桶配置' }, { status: 400 });
    }

    const baseUrl = picuiBucket.baseUrl.replace(/\/$/, '');
    const apiKey = picuiBucket.apiKey;
    let deleted = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // 获取图片列表
      const listRes = await undiciFetch(`${baseUrl}/images?page=${page}&per_page=100`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      });

      const listData = await listRes.json() as PicUIListResponse;

      if (!listRes.ok || !listData.status || !listData.data) {
        console.error('[PicUI Clear] Failed to list images:', listData.message);
        break;
      }

      const images = listData.data.data;
      if (images.length === 0) {
        hasMore = false;
        break;
      }

      // 删除每张图片
      for (const image of images) {
        try {
          const delRes = await undiciFetch(`${baseUrl}/images/${image.key}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'application/json',
            },
          });

          if (delRes.ok) {
            deleted++;
          }
        } catch (err) {
          console.error(`[PicUI Clear] Failed to delete image ${image.key}:`, err);
        }
      }

      // 检查是否还有更多页
      if (listData.data.current_page >= listData.data.last_page) {
        hasMore = false;
      } else {
        // 由于删除后列表会变化，保持 page=1 继续删除
        page = 1;
      }
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('[PicUI Clear] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '清空失败' },
      { status: 500 }
    );
  }
}
