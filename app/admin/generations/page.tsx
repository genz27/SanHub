'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, History, Loader2, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { IMAGE_MODELS } from '@/lib/model-config';
import { toast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PaginationControls } from '@/components/admin/pagination';
import { Modal } from '@/components/ui/modal';
import {
  AdminEmpty,
  AdminGhostButton,
  AdminHeader,
  AdminPanel,
  AdminPill,
  AdminSearchInput,
  AdminSelect,
  AdminTable,
  AdminTd,
  AdminTh,
  AdminToolbar,
} from '@/components/admin/admin-chrome';

const GENERATIONS_PAGE_SIZE = 50;

interface GenerationRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: string;
  params?: { model?: string };
  prompt: string;
  resultUrl: string;
  cost: number;
  status: string;
  createdAt: number;
}

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'sora-video', label: '视频' },
  { value: 'sora-image', label: '图像' },
  { value: 'gemini-image', label: 'Gemini 图像' },
  { value: 'zimage-image', label: 'Z-Image 图像' },
  { value: 'gitee-image', label: 'Gitee 图像' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'pending', label: '等待中' },
  { value: 'processing', label: '处理中' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const IMAGE_MODEL_LABELS = new Map(
  IMAGE_MODELS.map((model) => [model.apiModel, model.name])
);

const TYPE_LABELS: Record<string, string> = {
  'sora-video': '视频',
  'sora-image': '图像',
  'gemini-image': 'Gemini 图像',
  'zimage-image': 'Z-Image 图像',
  'gitee-image': 'Gitee 图像',
};

function getRecordTypeLabel(record: GenerationRecord): string {
  if (
    record.type === 'gemini-image' ||
    record.type === 'zimage-image' ||
    record.type === 'gitee-image'
  ) {
    const modelLabel = record.params?.model
      ? IMAGE_MODEL_LABELS.get(record.params.model)
      : undefined;
    if (modelLabel) return modelLabel;
  }

  return TYPE_LABELS[record.type] || record.type;
}

function statusTone(status: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'processing') return 'info';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: '完成',
    pending: '等待',
    processing: '处理中',
    failed: '失败',
    cancelled: '取消',
  };
  return labels[status] || status;
}

export default function GenerationsPage() {
  const [records, setRecords] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GenerationRecord | null>(null);

  const loadRecords = useCallback(async (nextPage = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setFetching(true);
      }

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(GENERATIONS_PAGE_SIZE));
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/admin/generations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.data || []);
        setPage(data.page || nextPage);
        setTotal(data.total || 0);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '加载失败', description: data.error || '无法获取生成记录', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '加载失败', description: err instanceof Error ? err.message : '无法获取生成记录', variant: 'destructive' });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRecords(1, true);
    }, 300);
    return () => clearTimeout(handle);
  }, [loadRecords, search, statusFilter, typeFilter]);

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setConfirmDialogOpen(false);

    try {
      const res = await fetch('/api/admin/generations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingDeleteId }),
      });
      if (res.ok) {
        toast({ title: '记录已删除' });
        if (selected?.id === pendingDeleteId) setSelected(null);
        const nextPage = records.length === 1 && page > 1 ? page - 1 : page;
        void loadRecords(nextPage, false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: '删除失败', description: data.error || '无法删除记录', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : '无法删除记录', variant: 'destructive' });
    } finally {
      setPendingDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminHeader title="生成记录" description="管理所有用户的生成历史" />
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader title="生成记录" description={`共 ${total} 条`} />

      <AdminToolbar>
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索用户或提示词"
          trailing={fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        />
        <AdminSelect value={typeFilter} onChange={setTypeFilter}>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </AdminSelect>
        <AdminSelect value={statusFilter} onChange={setStatusFilter}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </AdminSelect>
      </AdminToolbar>

      <AdminPanel>
        {records.length === 0 ? (
          <AdminEmpty
            icon={<History className="h-8 w-8" />}
            title="暂无记录"
            description="调整筛选条件后再试。"
          />
        ) : (
          <AdminTable minWidth="960px">
            <thead>
              <tr>
                <AdminTh>时间</AdminTh>
                <AdminTh>用户</AdminTh>
                <AdminTh>类型</AdminTh>
                <AdminTh>提示词</AdminTh>
                <AdminTh>状态</AdminTh>
                <AdminTh align="right">积分</AdminTh>
                <AdminTh align="right">操作</AdminTh>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => setSelected(record)}
                >
                  <AdminTd>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {formatDate(record.createdAt)}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{record.userName || '-'}</p>
                      <p className="truncate text-xs text-muted-foreground">{record.userEmail}</p>
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <AdminPill>{getRecordTypeLabel(record)}</AdminPill>
                  </AdminTd>
                  <AdminTd>
                    <p className="max-w-[320px] truncate text-muted-foreground" title={record.prompt}>
                      {record.prompt || '-'}
                    </p>
                  </AdminTd>
                  <AdminTd>
                    <AdminPill tone={statusTone(record.status)}>{statusLabel(record.status)}</AdminPill>
                  </AdminTd>
                  <AdminTd align="right">
                    <span className="text-muted-foreground">-{record.cost}</span>
                  </AdminTd>
                  <AdminTd align="right">
                    <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      {record.resultUrl && (
                        <AdminGhostButton
                          title="查看结果"
                          onClick={() => window.open(record.resultUrl, '_blank', 'noopener,noreferrer')}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          查看
                        </AdminGhostButton>
                      )}
                      <AdminGhostButton
                        danger
                        title="删除"
                        onClick={() => {
                          setPendingDeleteId(record.id);
                          setConfirmDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </AdminGhostButton>
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={GENERATIONS_PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => void loadRecords(nextPage, false)}
          loading={fetching}
        />
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="生成详情"
        size="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">用户</p>
                <p className="mt-1">{selected.userName || '-'}</p>
                <p className="text-xs text-muted-foreground">{selected.userEmail}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">时间</p>
                <p className="mt-1">{formatDate(selected.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">类型</p>
                <p className="mt-1">{getRecordTypeLabel(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">状态 / 积分</p>
                <p className="mt-1">
                  {statusLabel(selected.status)} · -{selected.cost}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">提示词</p>
              <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-foreground">
                {selected.prompt || '-'}
              </p>
            </div>
            <div className="flex gap-2">
              {selected.resultUrl && (
                <AdminGhostButton
                  onClick={() => window.open(selected.resultUrl, '_blank', 'noopener,noreferrer')}
                >
                  <Eye className="h-3.5 w-3.5" />
                  打开结果
                </AdminGhostButton>
              )}
              <AdminGhostButton
                danger
                onClick={() => {
                  setPendingDeleteId(selected.id);
                  setConfirmDialogOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </AdminGhostButton>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="确认删除"
        message="确定删除此记录？"
        confirmLabel="删除"
        variant="danger"
      />
    </div>
  );
}
