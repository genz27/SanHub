'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Key,
  Upload,
  RefreshCw,
  CheckCircle,
  XCircle,
  Save,
  Eye,
  EyeOff,
  BarChart3,
  ImageIcon,
  Video,
  AlertTriangle,
} from 'lucide-react';
import type { SoraStats } from '@/types';

interface ImportResult {
  success: { rt: string; tokenId: number }[];
  failed: { rt: string; error: string }[];
}

export default function TokensPage() {
  // 配置状态
  const [config, setConfig] = useState({
    soraBackendUrl: '',
    soraBackendUsername: '',
    soraBackendPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  // 统计数据状态
  const [stats, setStats] = useState<SoraStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  // 导入状态
  const [rtInput, setRtInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setConfig({
            soraBackendUrl: data.data.soraBackendUrl || '',
            soraBackendUsername: data.data.soraBackendUsername || '',
            soraBackendPassword: data.data.soraBackendPassword || '',
          });
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setConfigLoading(false);
    }
  };

  // 保存配置
  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soraBackendUrl: config.soraBackendUrl,
          soraBackendUsername: config.soraBackendUsername,
          soraBackendPassword: config.soraBackendPassword,
        }),
      });

      if (res.ok) {
        alert('配置保存成功！');
        // 保存成功后刷新统计数据
        loadStats();
      } else {
        const data = await res.json();
        alert(data.error || '保存失败');
      }
    } catch (err) {
      alert('保存失败');
    } finally {
      setConfigSaving(false);
    }
  };

  // 加载统计数据
  const loadStats = useCallback(async () => {
    if (!config.soraBackendUrl) return;

    setStatsLoading(true);
    setStatsError('');

    try {
      const res = await fetch('/api/admin/sora-tokens');
      const data = await res.json();

      if (data.success) {
        setStats(data.data);
      } else {
        setStatsError(data.error || '获取统计数据失败');
      }
    } catch (err) {
      setStatsError('获取统计数据失败');
    } finally {
      setStatsLoading(false);
    }
  }, [config.soraBackendUrl]);

  // 配置加载完成后自动获取统计
  useEffect(() => {
    if (!configLoading && config.soraBackendUrl) {
      loadStats();
    }
  }, [configLoading, config.soraBackendUrl, loadStats]);

  // 批量导入 RT
  const handleImport = async () => {
    const rts = rtInput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (rts.length === 0) {
      alert('请输入至少一个 RT');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/admin/sora-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', rts }),
      });

      const data = await res.json();

      if (data.success) {
        setImportResult(data.data);
        // 导入成功后刷新统计
        loadStats();
        // 清空输入框（只保留失败的）
        if (data.data.failed.length === 0) {
          setRtInput('');
        }
      } else {
        alert(data.error || '导入失败');
      }
    } catch (err) {
      alert('导入失败');
    } finally {
      setImporting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extralight text-white">SORA Token 管理</h1>
        <p className="text-white/50 mt-1 font-light">管理 SORA 后台账号和批量导入 Token</p>
      </div>

      {/* 统计数据 */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            统计数据
          </h2>
          <button
            onClick={loadStats}
            disabled={statsLoading || !config.soraBackendUrl}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {statsError && (
          <div className="text-red-400 text-sm mb-4">{statsError}</div>
        )}

        {!config.soraBackendUrl ? (
          <div className="text-white/50 text-sm">请先配置 SORA 后台地址</div>
        ) : statsLoading && !stats ? (
          <div className="flex items-center gap-2 text-white/50">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载中...
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
                <Key className="w-4 h-4" />
                Token 总数
              </div>
              <div className="text-2xl font-light text-white">{stats.total_tokens}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-400/70 text-sm mb-1">
                <CheckCircle className="w-4 h-4" />
                活跃 Token
              </div>
              <div className="text-2xl font-bold text-green-400">{stats.active_tokens}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400/70 text-sm mb-1">
                <ImageIcon className="w-4 h-4" />
                今日图片/总图片
              </div>
              <div className="text-2xl font-bold text-blue-400">
                {stats.today_images}/{stats.total_images}
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-400/70 text-sm mb-1">
                <Video className="w-4 h-4" />
                今日视频/总视频
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {stats.today_videos}/{stats.total_videos}
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400/70 text-sm mb-1">
                <AlertTriangle className="w-4 h-4" />
                今日错误/总错误
              </div>
              <div className="text-2xl font-bold text-red-400">
                {stats.today_errors}/{stats.total_errors}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* SORA 后台配置 */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          SORA 后台配置
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">后台地址</label>
            <input
              type="text"
              value={config.soraBackendUrl}
              onChange={(e) => setConfig({ ...config, soraBackendUrl: e.target.value })}
              placeholder="例如: http://sjc1.clusters.zeabur.com:25499"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">用户名</label>
              <input
                type="text"
                value={config.soraBackendUsername}
                onChange={(e) => setConfig({ ...config, soraBackendUsername: e.target.value })}
                placeholder="admin"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-2">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.soraBackendPassword}
                  onChange={(e) => setConfig({ ...config, soraBackendPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={saveConfig}
            disabled={configSaving}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors"
          >
            {configSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            保存配置
          </button>
        </div>
      </div>

      {/* 批量导入 RT */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          批量导入 Token
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Refresh Token (一行一个)
            </label>
            <textarea
              value={rtInput}
              onChange={(e) => setRtInput(e.target.value)}
              placeholder="rt_xxxxxxxxxx&#10;rt_yyyyyyyyyy&#10;rt_zzzzzzzzzz"
              rows={8}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 font-mono text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleImport}
              disabled={importing || !config.soraBackendUrl || !rtInput.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              开始导入
            </button>

            {!config.soraBackendUrl && (
              <span className="text-white/50 text-sm">请先配置 SORA 后台</span>
            )}
          </div>
        </div>

        {/* 导入结果 */}
        {importResult && (
          <div className="mt-6 space-y-4">
            {/* 成功列表 */}
            {importResult.success.length > 0 && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <CheckCircle className="w-4 h-4" />
                  成功导入 {importResult.success.length} 个
                </div>
                <div className="space-y-1 text-sm">
                  {importResult.success.map((item, i) => (
                    <div key={i} className="text-green-400/70">
                      {item.rt} → Token ID: {item.tokenId}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 失败列表 */}
            {importResult.failed.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <XCircle className="w-4 h-4" />
                  失败 {importResult.failed.length} 个
                </div>
                <div className="space-y-1 text-sm">
                  {importResult.failed.map((item, i) => (
                    <div key={i} className="text-red-400/70">
                      {item.rt} - {item.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
