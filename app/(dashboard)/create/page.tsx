'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Image as ImageIcon, Video } from 'lucide-react';
import type { Generation } from '@/types';
import {
  buildReusableImageReference,
  buildReusableImageReferenceFromId,
  type ReusableImageReference,
} from '@/lib/generation-client';
import { cn } from '@/lib/utils';
import { ImageGenerationPage } from '@/components/generator/image-generation-page';
import { VideoGenerationView } from '@/components/generator/video-generation-page';

type CreateMode = 'image' | 'video';

const CREATE_TABS: Array<{
  id: CreateMode;
  label: string;
  description: string;
  icon: typeof ImageIcon;
}> = [
  {
    id: 'image',
    label: '图片创作',
    description: '文生图与图生图',
    icon: ImageIcon,
  },
  {
    id: 'video',
    label: '视频创作',
    description: '普通生成、Remix、分镜',
    icon: Video,
  },
];

function normalizeMode(value: string | null): CreateMode {
  return value === 'video' ? 'video' : 'image';
}

function buildReferenceFromQuery(referenceId: string | null): ReusableImageReference | null {
  if (!referenceId) return null;
  return buildReusableImageReferenceFromId(referenceId);
}

export default function CreatePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const initialMode = normalizeMode(searchParams.get('mode'));
  const initialReferenceId = searchParams.get('referenceId');

  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [imageReference, setImageReference] = useState<ReusableImageReference | null>(() =>
    initialMode === 'image' ? buildReferenceFromQuery(initialReferenceId) : null
  );
  const [videoReference, setVideoReference] = useState<ReusableImageReference | null>(() =>
    initialMode === 'video' ? buildReferenceFromQuery(initialReferenceId) : null
  );

  const activeReferenceId =
    mode === 'image' ? imageReference?.generationId ?? null : videoReference?.generationId ?? null;

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const nextMode = normalizeMode(params.get('mode'));
    const nextReferenceId = params.get('referenceId');

    setMode((current) => (current === nextMode ? current : nextMode));

    if (nextMode === 'image') {
      setImageReference((current) => {
        if (!nextReferenceId) {
          return current ? null : current;
        }

        return current?.generationId === nextReferenceId
          ? current
          : buildReusableImageReferenceFromId(nextReferenceId);
      });
      return;
    }

    setVideoReference((current) => {
      if (!nextReferenceId) {
        return current ? null : current;
      }

      return current?.generationId === nextReferenceId
        ? current
        : buildReusableImageReferenceFromId(nextReferenceId);
    });
  }, [searchParamsString]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const currentMode = normalizeMode(params.get('mode'));
    const currentReferenceId = params.get('referenceId');

    if (currentMode === mode && (currentReferenceId ?? null) === activeReferenceId) {
      return;
    }

    params.set('mode', mode);

    if (activeReferenceId) {
      params.set('referenceId', activeReferenceId);
    } else {
      params.delete('referenceId');
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeReferenceId, mode, pathname, router, searchParamsString]);

  const handleTabChange = useCallback((nextMode: CreateMode) => {
    setMode(nextMode);
  }, []);

  const handleReuseGeneration = useCallback(
    (generation: Generation, target: 'image' | 'video') => {
      const reusableReference = buildReusableImageReference(generation);
      if (!reusableReference) {
        return;
      }

      if (target === 'image') {
        setImageReference(reusableReference);
        setMode('image');
        return;
      }

      setVideoReference(reusableReference);
      setMode('video');
    },
    []
  );

  const clearReferenceForGeneration = useCallback((generationId: string) => {
    setImageReference((current) =>
      current?.generationId === generationId ? null : current
    );
    setVideoReference((current) =>
      current?.generationId === generationId ? null : current
    );
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="surface p-2 flex flex-wrap gap-2">
        {CREATE_TABS.map((tab) => {
          const isActive = mode === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                isActive
                  ? 'border-border/80 bg-card/80 text-foreground'
                  : 'border-transparent bg-transparent text-foreground/60 hover:bg-card/60 hover:text-foreground/80'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg border',
                  isActive
                    ? 'border-border/70 bg-foreground/5'
                    : 'border-border/40 bg-card/40'
                )}
              >
                <tab.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="text-xs text-foreground/45">{tab.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={cn(mode === 'image' ? 'block' : 'hidden')}>
        <ImageGenerationPage
          embedded
          isActive={mode === 'image'}
          externalReference={imageReference}
          onClearExternalReference={() => setImageReference(null)}
          onReuseGeneration={handleReuseGeneration}
          onGenerationDeleted={clearReferenceForGeneration}
        />
      </div>

      <div className={cn(mode === 'video' ? 'block' : 'hidden')}>
        <VideoGenerationView
          embedded
          isActive={mode === 'video'}
          externalReference={videoReference}
          onExternalReferenceChange={setVideoReference}
        />
      </div>
    </div>
  );
}
