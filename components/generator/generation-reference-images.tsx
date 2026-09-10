'use client';
/* eslint-disable @next/next/no-img-element */

import { Download } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { generationReferenceImageUrls } from '@/lib/generation-reference';
import type { Generation } from '@/types';

export function GenerationReferenceImages({
  generation,
}: {
  generation: Pick<Generation, 'id'> & { params?: Generation['params'] };
}) {
  const urls = generationReferenceImageUrls(generation);
  if (urls.length === 0) return null;

  const handleDownload = async (url: string, index: number) => {
    try {
      const { downloadAsset } = await import('@/lib/download');
      await downloadAsset(url, `sanhub-${generation.id}-ref-${index + 1}.png`);
    } catch (error) {
      console.error('Reference download failed', error);
      toast({
        title: '下载失败',
        description: '参考图无法下载，请稍后重试',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground/40">
        {generation.params?.kind === 'region-edit' || generation.params?.sourceGenerationId
          ? `原图 / 参考图 · ${urls.length}`
          : `参考图 · ${urls.length}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {urls.map((url, index) => (
          <div
            key={`${generation.id}-ref-${index}`}
            className="overflow-hidden rounded-xl border border-border/70 bg-card/40"
          >
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square bg-background/40"
              title={`打开参考图 ${index + 1}`}
            >
              <img
                src={url}
                alt={`参考图 ${index + 1}`}
                className="h-full w-full object-cover"
                decoding="async"
              />
            </a>
            <button
              type="button"
              onClick={() => void handleDownload(url, index)}
              className="flex h-8 w-full items-center justify-center gap-1.5 border-t border-border/70 text-[11px] text-foreground/70 hover:bg-card hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              下载
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
