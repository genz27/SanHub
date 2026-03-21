import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getFeed } from '@/lib/sora-api';
import { getSystemConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 转换 API 响应中的 post 格式为前端期望的 FeedItem 格式
function transformPostToFeedItem(item: any) {
  const post = item.post || item;
  const profile = item.profile || post.author;
  // API 返回的是 attachments 数组
  const attachment = post.attachments?.[0];
  
  return {
    id: post.id,
    text: post.text || post.discovery_phrase || '',
    permalink: post.permalink,
    preview_image_url: attachment?.encodings?.thumbnail?.path || post.preview_image_url || '',
    posted_at: post.posted_at || post.created_at,
    like_count: post.like_count || 0,
    view_count: post.view_count || 0,
    remix_count: post.remix_count || 0,
    attachment: {
      kind: attachment?.kind || 'sora',
      url: attachment?.url || attachment?.encodings?.md?.path || '',
      downloadable_url: attachment?.downloadable_url || attachment?.encodings?.source?.path || '',
      width: attachment?.width || 1920,
      height: attachment?.height || 1080,
      n_frames: attachment?.n_frames,
      duration_seconds: attachment?.duration_seconds,
      thumbnail_url: attachment?.encodings?.thumbnail?.path,
    },
    author: {
      user_id: profile?.user_id || '',
      username: profile?.username || '',
      display_name: profile?.display_name || profile?.username || '',
      profile_picture_url: profile?.profile_picture_url || '',
      follower_count: profile?.follower_count || 0,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const config = await getSystemConfig();
    if (!config.featureFlags.squareEnabled) {
      return NextResponse.json({ error: '广场功能未开启' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '12');
    const cut = (searchParams.get('cut') || 'nf2_latest') as 'nf2_latest' | 'nf2_top';
    const cursor = searchParams.get('cursor') || undefined;

    const result = await getFeed({ limit, cut, cursor });
    
    // 转换 items 格式
    const transformedItems = (result.items || []).map(transformPostToFeedItem);

    return NextResponse.json({
      success: true,
      items: transformedItems,
      cursor: result.cursor,
      count: transformedItems.length,
    });
  } catch (error) {
    console.error('[API] Feed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取 Feed 失败' },
      { status: 500 }
    );
  }
}
