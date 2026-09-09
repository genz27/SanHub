'use client';
/* eslint-disable @next/next/no-img-element */

import { Loader2, Trash2, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import type { CharacterCard } from '@/types';

export type CharacterCardPendingTask = {
  id: string;
  avatarUrl: string;
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string;
  createdAt: number;
};

function PendingTaskItem({ task }: { task: CharacterCardPendingTask }) {
  const statusConfig = {
    pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '排队中' },
    processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '生成中' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: '失败' },
  };
  const status = statusConfig[task.status];

  return (
    <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden hover:border-border/70 transition-all">
      <div className="aspect-square bg-gradient-to-br from-emerald-500/10 to-sky-500/10 flex items-center justify-center relative">
        {task.avatarUrl ? (
          <img src={task.avatarUrl} alt="" className="w-full h-full object-cover opacity-60" />
        ) : (
          <User className="w-12 h-12 text-foreground/30" />
        )}
        <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-2">
          {task.status === 'processing' ? (
            <Loader2 className="w-8 h-8 text-foreground animate-spin" />
          ) : task.status === 'pending' ? (
            <div className="w-8 h-8 rounded-full border-2 border-amber-400/50 border-t-amber-400 animate-spin" />
          ) : null}
          <span className={cn('px-2.5 py-1 text-xs rounded-full font-medium', status.bg, status.text)}>
            {status.label}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm text-foreground/60 truncate">正在生成...</p>
        <p className="text-[10px] text-foreground/30 mt-1">{formatDate(task.createdAt)}</p>
        {task.errorMessage && (
          <p className="text-[10px] text-red-400 mt-1 truncate">{task.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function CharacterCardItem({ card, onDelete }: { card: CharacterCard; onDelete?: (id: string) => void }) {
  const statusConfig = {
    pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '排队中' },
    processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '生成中' },
    completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '完成' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: '失败' },
  };
  const status = statusConfig[card.status];
  const isProcessing = card.status === 'processing' || card.status === 'pending';

  return (
    <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden hover:border-emerald-500/30 transition-all group">
      <div className={cn(
        'aspect-square flex items-center justify-center relative',
        card.status === 'failed' ? 'bg-gradient-to-br from-red-500/10 to-red-900/10' : 'bg-gradient-to-br from-emerald-500/10 to-sky-500/10'
      )}>
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt={card.characterName}
            className={cn('w-full h-full object-cover', (card.status === 'failed' || isProcessing) && 'opacity-60')}
          />
        ) : isProcessing ? (
          <Loader2 className="w-10 h-10 text-foreground/30 animate-spin" />
        ) : card.status === 'failed' ? (
          <X className="w-10 h-10 text-red-400/50" />
        ) : (
          <User className="w-12 h-12 text-foreground/30" />
        )}

        {(isProcessing || card.status === 'failed') && (
          <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-2">
            {isProcessing && <Loader2 className="w-8 h-8 text-foreground animate-spin" />}
            {card.status === 'failed' && <X className="w-8 h-8 text-red-400" />}
          </div>
        )}

        {onDelete && (
          <button
            onClick={() => onDelete(card.id)}
            className="absolute top-2 right-2 p-1.5 bg-background/70 hover:bg-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5 text-foreground" />
          </button>
        )}

        <div className="absolute bottom-2 left-2">
          <span className={cn('px-2 py-0.5 text-[10px] rounded-full font-medium backdrop-blur-sm', status.bg, status.text)}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-sm font-medium text-foreground truncate">
          {card.characterName || (card.status === 'failed' ? '生成失败' : '生成中...')}
        </h3>
        <p className="text-[10px] text-foreground/30 mt-1">{formatDate(card.createdAt)}</p>
        {card.errorMessage && (
          <p className="text-[10px] text-red-400 mt-1 line-clamp-1" title={card.errorMessage}>
            {card.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export function CharacterCardGrid({
  cards,
  pendingTasks,
  onDelete,
}: {
  cards: CharacterCard[];
  pendingTasks: CharacterCardPendingTask[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {pendingTasks.map((task) => (
        <PendingTaskItem key={task.id} task={task} />
      ))}
      {cards
        .filter((card) => !pendingTasks.some((task) => task.id === card.id))
        .map((card) => (
          <CharacterCardItem key={card.id} card={card} onDelete={onDelete} />
        ))}
    </div>
  );
}
