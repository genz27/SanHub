'use client';

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import { deleteGenerationRecords } from '@/lib/generation-delete';
import { isFailedGenerationStatus, mergeTasksById } from '@/lib/generation-state';

export function useClearFailedTasks(setTasks: Dispatch<SetStateAction<Task[]>>) {
  const dismissedFailedIdsRef = useRef(new Set<string>());
  const clearingRef = useRef(false);
  const [clearingFailedTasks, setClearingFailedTasks] = useState(false);

  const isClearingFailedTasks = useCallback(() => clearingRef.current, []);

  const dismissFailedTaskIds = useCallback((ids: string[]) => {
    const dismissedIds = dismissedFailedIdsRef.current;
    for (const id of ids) {
      dismissedIds.add(id);
    }
  }, []);

  const rejectDismissedFailedTasks = useCallback(<T extends { id: string }>(incoming: T[]) => {
    const dismissedIds = dismissedFailedIdsRef.current;
    if (dismissedIds.size === 0) return incoming;
    return incoming.filter((item) => !dismissedIds.has(item.id));
  }, []);

  const clearFailedTasks = useCallback(
    async (tasks: Task[]) => {
      if (clearingRef.current) return;

      const failedTasks = tasks.filter((task) => isFailedGenerationStatus(task.status));
      if (failedTasks.length === 0) return;

      const persistedIds = failedTasks
        .filter((task) => task.persisted !== false)
        .map((task) => task.id);
      const localOnlyCount = failedTasks.length - persistedIds.length;

      dismissFailedTaskIds(failedTasks.map((task) => task.id));
      clearingRef.current = true;
      setClearingFailedTasks(true);
      setTasks((prev) => prev.filter((task) => !isFailedGenerationStatus(task.status)));

      try {
        const deletedCount = await deleteGenerationRecords(persistedIds);
        const description =
          [
            deletedCount > 0 ? `已删除 ${deletedCount} 条历史错误记录` : '',
            localOnlyCount > 0 ? `已移除 ${localOnlyCount} 条本地查询错误` : '',
          ]
            .filter(Boolean)
            .join('，') || '没有需要删除的历史错误记录';

        toast({
          title: '错误任务已清理',
          description,
        });
      } catch (err) {
        for (const task of failedTasks) {
          dismissedFailedIdsRef.current.delete(task.id);
        }
        setTasks((prev) => mergeTasksById(prev, failedTasks));
        toast({
          title: '清理失败',
          description: err instanceof Error ? err.message : '清理错误任务失败',
          variant: 'destructive',
        });
      } finally {
        clearingRef.current = false;
        setClearingFailedTasks(false);
      }
    },
    [dismissFailedTaskIds, setTasks]
  );

  return {
    clearingFailedTasks,
    clearFailedTasks,
    dismissFailedTaskIds,
    isClearingFailedTasks,
    rejectDismissedFailedTasks,
  };
}
