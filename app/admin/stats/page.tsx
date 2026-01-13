'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Users, Zap, TrendingUp, Loader2 } from 'lucide-react';
import type { StatsOverview } from '@/types';
import { formatBalance } from '@/lib/utils';

// Calculate nice Y-axis ticks
function calcYAxisTicks(max: number): number[] {
  if (max <= 0) return [0];
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  let step = magnitude;
  if (max / step < 3) step = magnitude / 2;
  if (max / step > 6) step = magnitude * 2;
  step = Math.max(1, Math.round(step));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/stats?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  const maxGen = Math.max(...stats.dailyStats.map(d => d.generations), 1);
  const maxUsers = Math.max(...stats.dailyStats.map(d => d.users), 1);
  const genTicks = calcYAxisTicks(maxGen);
  const userTicks = calcYAxisTicks(maxUsers);
  const genCeil = genTicks[genTicks.length - 1] || 1;
  const userCeil = userTicks[userTicks.length - 1] || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">数据统计</h1>
          <p className="text-foreground/50 mt-1">系统运行数据概览</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-4 py-2 bg-card/70 border border-border/70 rounded-xl text-foreground focus:outline-none focus:border-border/70 [&>option]:bg-card/95 [&>option]:text-foreground"
        >
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
          <option value={90}>最近 90 天</option>
        </select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="总用户" value={stats.totalUsers} color="blue" />
        <StatCard icon={Zap} label="总生成" value={stats.totalGenerations} color="green" />
        <StatCard icon={TrendingUp} label="今日新增用户" value={stats.todayUsers} color="sky" />
        <StatCard icon={BarChart3} label="今日生成" value={stats.todayGenerations} color="orange" />
      </div>

      {/* Generation Chart */}
      <div className="bg-card/60 border border-border/70 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">生成量趋势</h2>
        {stats.dailyStats.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-foreground/40">暂无数据</div>
        ) : (
          <div className="flex">
            {/* Y-axis */}
            <div className="flex flex-col justify-between h-48 pr-2 text-right">
              {[...genTicks].reverse().map((v) => (
                <span key={v} className="text-[10px] text-foreground/40">{v}</span>
              ))}
            </div>
            {/* Chart */}
            <div className="flex-1 flex flex-col">
              <div className="h-48 flex items-end gap-[2px] border-l border-b border-border/70 pl-1">
                {stats.dailyStats.map((day, i) => (
                  <div key={day.date || i} className="flex-1 h-full flex items-end justify-center group relative min-w-[6px]">
                    <div 
                      className="w-full max-w-[20px] bg-gradient-to-t from-sky-500 to-emerald-500 rounded-t opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ height: `${(day.generations / genCeil) * 100}%`, minHeight: day.generations > 0 ? '4px' : '0' }}
                      title={`${day.date}: ${day.generations}`}
                    />
                  </div>
                ))}
              </div>
              {/* X-axis */}
              <div className="flex justify-between mt-2 pl-1">
                {stats.dailyStats.filter((_, i) => i % Math.ceil(stats.dailyStats.length / 7) === 0).map((day) => (
                  <span key={day.date} className="text-[10px] text-foreground/40">{day.date?.slice(5)}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Growth Chart */}
      <div className="bg-card/60 border border-border/70 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">用户增长</h2>
        {stats.dailyStats.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-foreground/40">暂无数据</div>
        ) : (
          <div className="flex">
            {/* Y-axis */}
            <div className="flex flex-col justify-between h-48 pr-2 text-right">
              {[...userTicks].reverse().map((v) => (
                <span key={v} className="text-[10px] text-foreground/40">{v}</span>
              ))}
            </div>
            {/* Chart */}
            <div className="flex-1 flex flex-col">
              <div className="h-48 flex items-end gap-[2px] border-l border-b border-border/70 pl-1">
                {stats.dailyStats.map((day, i) => (
                  <div key={day.date || i} className="flex-1 h-full flex items-end justify-center group relative min-w-[6px]">
                    <div 
                      className="w-full max-w-[20px] bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ height: `${(day.users / userCeil) * 100}%`, minHeight: day.users > 0 ? '4px' : '0' }}
                      title={`${day.date}: ${day.users}`}
                    />
                  </div>
                ))}
              </div>
              {/* X-axis */}
              <div className="flex justify-between mt-2 pl-1">
                {stats.dailyStats.filter((_, i) => i % Math.ceil(stats.dailyStats.length / 7) === 0).map((day) => (
                  <span key={day.date} className="text-[10px] text-foreground/40">{day.date?.slice(5)}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Daily Details Table */}
      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border/70">
          <h2 className="text-lg font-semibold text-foreground">每日明细</h2>
        </div>
        <div className="overflow-x-auto no-scrollbar max-h-96">
          <table className="w-full min-w-[640px]">
            <thead className="sticky top-0 bg-background/60 backdrop-blur">
              <tr className="border-b border-border/70">
                <th className="text-left text-sm font-medium text-foreground/50 px-5 py-3">日期</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-3">新用户</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-3">生成次数</th>
                <th className="text-right text-sm font-medium text-foreground/50 px-5 py-3">消耗积分</th>
              </tr>
            </thead>
            <tbody>
              {[...stats.dailyStats].reverse().map((day) => (
                <tr key={day.date} className="border-b border-border/70 hover:bg-card/60">
                  <td className="px-5 py-3 text-foreground">{day.date}</td>
                  <td className="px-5 py-3 text-right text-blue-400">{day.users}</td>
                  <td className="px-5 py-3 text-right text-sky-400">{day.generations}</td>
                  <td className="px-5 py-3 text-right text-orange-400">{formatBalance(day.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { 
  icon: typeof Users; 
  label: string; 
  value: number; 
  color: 'blue' | 'green' | 'sky' | 'orange' 
}) {
  const colors = {
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    green: { bg: 'bg-green-500/20', text: 'text-green-400' },
    sky: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
    orange: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  };
  const { bg, text } = colors[color];

  return (
    <div className="bg-card/60 border border-border/70 rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${text}`} />
        </div>
        <div>
          <p className="text-2xl font-semibold text-foreground">{value.toLocaleString()}</p>
          <p className="text-sm text-foreground/50">{label}</p>
        </div>
      </div>
    </div>
  );
}

