'use client';

import { Calendar, Trash2, User } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { CharacterCard } from '@/types';

export function CharacterCardHistoryItem({
  card,
  onDelete,
}: {
  card: CharacterCard;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="w-full flex gap-4 p-4 bg-gradient-to-br from-emerald-500/5 to-sky-500/5 hover:from-emerald-500/10 hover:to-sky-500/10 border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl transition-all duration-300 relative group">
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card/50 border border-border/60 flex items-center justify-center shrink-0 relative overflow-hidden select-none">
        <span className="absolute top-1 left-1 z-10 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-medium border border-emerald-500/20">
          已完成
        </span>
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <User className="w-10 h-10 text-emerald-300/45" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-sm font-medium text-foreground truncate flex-1">
              @{card.characterName || '未命名角色'}
            </h3>
            <span className="text-[10px] text-foreground/45 font-medium px-2 py-0.5 bg-card/30 border border-border/50 rounded-md whitespace-nowrap">
              角色卡
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
            <span className="px-2 py-0.5 bg-card/45 border border-border/60 rounded-md text-[10px] text-foreground/60 flex items-center gap-1 font-medium select-none">
              <User className="w-3 h-3 text-emerald-400" />
              角色卡
            </span>
            <span className="text-[10px] text-foreground/40 flex items-center gap-1 font-light select-none">
              <Calendar className="w-3 h-3 text-foreground/30" />
              {formatDate(card.createdAt)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
          <button
            onClick={() => onDelete(card.id)}
            className="inline-flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 rounded-lg transition-all"
            title="删除角色卡"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
