'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, Loader2 } from 'lucide-react';

interface SearchResult {
  user_id: string;
  username: string;
  display_name: string;
  profile_picture_url: string;
  can_cameo: boolean;
}

export default function SquarePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  // 搜索用户
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const params = new URLSearchParams({
        username: searchQuery.trim(),
        intent: 'users',
        limit: '20',
      });
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '搜索失败');
      }

      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // 导航到用户页面
  const handleUserClick = (username: string) => {
    router.push(`/square/user/${encodeURIComponent(username)}`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-10">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extralight text-white">搜索用户</h1>
        <p className="text-white/50 font-light">
          搜索 Sora 创作者，查看他们的作品
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="输入用户名..."
          className="w-full pl-12 pr-24 py-4 bg-white/5 border border-white/10 text-white rounded-2xl focus:outline-none focus:border-white/30 placeholder:text-white/30 text-lg"
          autoFocus
        />
        <button
          type="submit"
          disabled={!searchQuery.trim() || loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-white text-black rounded-xl font-medium text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '搜索'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Results */}
      {searched && !loading && (
        <div className="space-y-3">
          {results.length > 0 ? (
            <>
              <p className="text-white/50 text-sm">找到 {results.length} 个用户</p>
              <div className="space-y-2">
                {results.map((user) => (
                  <button
                    key={user.user_id}
                    onClick={() => handleUserClick(user.username)}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all text-left"
                  >
                    {user.profile_picture_url ? (
                      <img
                        src={user.profile_picture_url}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover bg-white/10"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                        <User className="w-6 h-6 text-white/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {user.display_name || user.username}
                      </p>
                      <p className="text-white/50 text-sm">@{user.username}</p>
                    </div>
                    {user.can_cameo && (
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-lg">
                        角色
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <User className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/40 text-sm">未找到匹配的用户</p>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!searched && !loading && (
        <div className="flex flex-col items-center gap-4 pt-8">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
            <User className="w-8 h-8 text-white/30" />
          </div>
          <p className="text-white/30 text-sm text-center">
            输入用户名搜索 Sora 创作者
          </p>
        </div>
      )}
    </div>
  );
}
