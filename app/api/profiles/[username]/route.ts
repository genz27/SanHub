/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProfile, getUserFeed } from '@/lib/sora-api';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '12');
    const cursor = searchParams.get('cursor') || undefined;

    // 获取用户资料
    const profileResult = await getProfile(username);
    const profileData = profileResult.profile;

    console.log('[API] Profile loaded:', {
      user_id: profileData.user_id,
      username: profileData.username,
    });

    // 单独获取用户发布的内容
    const feedResult = await getUserFeed({
      user_id: profileData.user_id,
      limit,
      cursor,
    });

    // API 返回结构: { success, user_id, feed: { items, cursor } }
    const feedData = (feedResult as any).feed || feedResult;
    const feedItems = feedData.items || [];
    const feedCursor = feedData.cursor || null;

    console.log('[API] Feed loaded:', {
      itemsCount: feedItems.length,
      cursor: feedCursor,
    });

    // 转换 items 格式
    const transformedItems = feedItems.map(transformPostToFeedItem);

    return NextResponse.json({
      success: true,
      profile: {
        user_id: profileData.user_id,
        username: profileData.username,
        display_name: profileData.display_name,
        profile_picture_url: profileData.profile_picture_url,
        follower_count: profileData.follower_count || 0,
      },
      feed: {
        items: transformedItems,
        cursor: feedCursor,
        count: transformedItems.length,
      },
    });
  } catch (error) {
    console.error('[API] Profile error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取用户资料失败' },
      { status: 500 }
    );
  }
}
