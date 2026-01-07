'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Play,
  Heart,
  Eye,
  User,
  Users,
  RefreshCw,
  X,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Profile {
  user_id: string;
  username: string;
  display_name: string;
  profile_picture_url: string;
  follower_count: number;
}

interface FeedItem {
  id: string;
  text: string;
  permalink: string;
  preview_image_url: string;
  posted_at: number;
  like_count: number;
  view_count: number;
  remix_count: number;
  attachment: {
    kind: string;
    url: string;
    downloadable_url: string;
    width: number;
    height: number;
    n_frames?: number;
    duration_seconds?: number;
    thumbnail_url?: string;
  };
  author: {
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
  };
}

// 格式化数字
const formatNumber = (num: number) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

// 独立的卡片组件，使用 memo 优化渲染
interface FeedCardProps {
  item: FeedItem;
  onVideoClick: (item: FeedItem) => void;
}

const FeedCard = memo(function FeedCard({ item, onVideoClick }: FeedCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const thumbnailUrl = item.attachment?.thumbnail_url || item.preview_image_url;
  const aspectRatio = item.attachment?.width && item.attachment?.height 
    ? item.attachment.width / item.attachment.height 
    : 9 / 16;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all group">
      {/* Media */}
      <div className="relative" style={{ aspectRatio }}>
        <button
          onClick={() => onVideoClick(item)}
          className="block w-full h-full text-left"
        >
          {/* Skeleton */}
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-white/5 animate-pulse" />
          )}
          
          {/* Image */}
          {thumbnailUrl && !imageError ? (
            <img
              src={thumbnailUrl}
              alt=""
              className={cn(
                'w-full h-full object-cover transition-opacity duration-300',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <Play className="w-8 h-8 text-white/20" />
            </div>
          )}
          
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
            </div>
          </div>
          
          {/* Duration badge */}
          {item.attachment?.duration_seconds && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-xs text-white font-medium">
              {Math.floor(item.attachment.duration_seconds)}s
            </div>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Text */}
        {item.text && (
          <p className="text-sm text-white/80 line-clamp-2 leading-relaxed">{item.text}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            {formatNumber(item.like_count)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {formatNumber(item.view_count)}
          </span>
        </div>
      </div>
    </div>
  );
});

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [selectedVideo, setSelectedVideo] = useState<FeedItem | null>(null);

  // 加载用户资料和内容
  const loadProfile = useCallback(async (cursorParam?: string) => {
    if (cursorParam) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setItems([]);
    }
    setError('');

    try {
      const params = new URLSearchParams({ limit: '12' });
      if (cursorParam) {
        params.append('cursor', cursorParam);
      }

      const res = await fetch(`/api/profiles/${encodeURIComponent(username)}?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '加载失败');
      }

      setProfile(data.profile);

      if (cursorParam) {
        setItems(prev => [...prev, ...(data.feed?.items || [])]);
      } else {
        setItems(data.feed?.items || []);
      }

      setCursor(data.feed?.cursor || null);
      setHasMore(!!(data.feed?.cursor && data.feed?.items?.length > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [username]);

  // 初始加载
  useEffect(() => {
    if (username) {
      loadProfile();
    }
  }, [username, loadProfile]);

  // 无限滚动
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && hasMore && !loadingMore) {
          loadProfile(cursor);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [cursor, hasMore, loadingMore, loadProfile]);

  // 选择视频
  const handleVideoClick = useCallback((item: FeedItem) => {
    setSelectedVideo(item);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!selectedVideo?.attachment?.downloadable_url) return;

    const url = selectedVideo.attachment.downloadable_url;
    const pathname = url.split('?')[0];
    const ext = pathname.includes('.') ? pathname.split('.').pop() || '' : '';
    const fallbackExt = selectedVideo.attachment.kind?.includes('video') ? 'mp4' : 'png';
    const filename = `sanhub-${selectedVideo.id}.${ext || fallbackExt}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed', err);
    }
  }, [selectedVideo]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.push('/square')}
        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">返回广场</span>
      </button>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-white/30" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Profile Header */}
      {!loading && profile && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            {profile.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={profile.display_name}
                className="w-20 h-20 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <User className="w-10 h-10 text-white/30" />
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-2xl font-light text-white">
                {profile.display_name || profile.username}
              </h1>
              <p className="text-white/50 text-sm">@{profile.username}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-sm text-white/60">
                  <Users className="w-4 h-4" />
                  {formatNumber(profile.follower_count)} 粉丝
                </span>
              </div>
            </div>

            {/* Refresh */}
            <button
              onClick={() => loadProfile()}
              disabled={loading}
              className="p-2 text-white/50 hover:text-white/80 transition-colors"
            >
              <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      )}

      {/* Content Grid - 使用 CSS columns 实现瀑布流 */}
      {!loading && items.length > 0 && (
        <div>
          <h2 className="text-lg font-light text-white mb-4">作品</h2>
          <div 
            className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4"
            style={{ columnFill: 'balance' }}
          >
            {items.map((item) => (
              <div key={item.id} className="break-inside-avoid mb-4">
                <FeedCard
                  item={item}
                  onVideoClick={handleVideoClick}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && profile && (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/20 rounded-xl">
          <Play className="w-12 h-12 text-white/20 mb-3" />
          <p className="text-white/40">该用户暂无作品</p>
        </div>
      )}

      {/* Load More */}
      <div ref={loadMoreRef} className="py-4">
        {loadingMore && (
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        )}
        {!hasMore && items.length > 0 && (
          <p className="text-center text-white/30 text-sm">没有更多了</p>
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedVideo(null)}
        >
          <div 
            className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-3">
                {profile && (
                  <div className="flex items-center gap-2">
                    {profile.profile_picture_url ? (
                      <img
                        src={profile.profile_picture_url}
                        alt={profile.display_name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-white/50" />
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{profile.display_name}</p>
                      <p className="text-xs text-white/50">@{profile.username}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  title="下载视频"
                >
                  <Download className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={() => setSelectedVideo(null)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Video */}
            <div className="flex items-center justify-center bg-black">
              <video
                src={selectedVideo.attachment.downloadable_url}
                controls
                autoPlay
                loop
                className="max-w-full max-h-[70vh] object-contain"
                style={{
                  aspectRatio: `${selectedVideo.attachment.width}/${selectedVideo.attachment.height}`,
                }}
              />
            </div>

            {/* Footer */}
            <div className="p-4 bg-zinc-900 border-t border-white/10">
              <p className="text-sm text-white/80 mb-3">{selectedVideo.text}</p>
              <div className="flex items-center gap-4 text-xs text-white/40">
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  {formatNumber(selectedVideo.like_count)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {formatNumber(selectedVideo.view_count)}
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                  {formatNumber(selectedVideo.remix_count)} remix
                </span>
                <a
                  href={selectedVideo.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-white/50 hover:text-white/80 transition-colors"
                >
                  在 Sora 中打开 →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
