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

function CreateModeSwitcher({
  mode,
  onChange,
}: {
  mode: CreateMode;
  onChange: (mode: CreateMode) => void;
}) {
  return (
    <div className="inline-flex w-full flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1 sm:w-auto sm:flex-nowrap">
      {CREATE_TABS.map((tab) => {
        const isActive = mode === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors sm:min-w-[124px]',
              isActive
                ? 'bg-background/80 text-foreground shadow-sm'
                : 'text-foreground/55 hover:bg-background/50 hover:text-foreground/80'
            )}
          >
            <tab.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function CreatePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const initialMode = normalizeMode(searchParams.get('mode'));
  const initialReferenceId = searchParams.get('referenceId');
  const mode = initialMode;
  const [mountedModes, setMountedModes] = useState<Record<CreateMode, boolean>>(() => ({
    image: initialMode === 'image',
    video: initialMode === 'video',
  }));
  const [imageReference, setImageReference] = useState<ReusableImageReference | null>(() =>
    initialMode === 'image' ? buildReferenceFromQuery(initialReferenceId) : null
  );
  const [videoReference, setVideoReference] = useState<ReusableImageReference | null>(() =>
    initialMode === 'video' ? buildReferenceFromQuery(initialReferenceId) : null
  );

  const activeReferenceId =
    mode === 'image' ? imageReference?.generationId ?? null : videoReference?.generationId ?? null;

  useEffect(() => {
    setMountedModes((current) =>
      current[mode] ? current : { ...current, [mode]: true }
    );
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const nextReferenceId = params.get('referenceId');

    if (mode === 'image') {
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
  }, [mode, searchParamsString]);

  const updateRoute = useCallback(
    (nextMode: CreateMode, nextReferenceId: string | null) => {
      const params = new URLSearchParams(searchParamsString);
      params.set('mode', nextMode);

      if (nextReferenceId) {
        params.set('referenceId', nextReferenceId);
      } else {
        params.delete('referenceId');
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParamsString]
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const currentMode = params.get('mode');
    const currentReferenceId = params.get('referenceId');

    if (currentMode === mode && (currentReferenceId ?? null) === activeReferenceId) {
      return;
    }
    updateRoute(mode, activeReferenceId);
  }, [activeReferenceId, mode, searchParamsString, updateRoute]);

  const handleTabChange = useCallback(
    (nextMode: CreateMode) => {
      if (nextMode === mode) {
        return;
      }

      setMountedModes((current) =>
        current[nextMode] ? current : { ...current, [nextMode]: true }
      );

      const nextReferenceId =
        nextMode === 'image'
          ? imageReference?.generationId ?? null
          : videoReference?.generationId ?? null;

      updateRoute(nextMode, nextReferenceId);
    },
    [imageReference?.generationId, mode, updateRoute, videoReference?.generationId]
  );

  const handleReuseGeneration = useCallback(
    (generation: Generation, target: 'image' | 'video') => {
      const reusableReference = buildReusableImageReference(generation);
      if (!reusableReference) {
        return;
      }

      if (target === 'image') {
        setImageReference(reusableReference);
        setMountedModes((current) =>
          current.image ? current : { ...current, image: true }
        );
        updateRoute('image', reusableReference.generationId);
        return;
      }

      setVideoReference(reusableReference);
      setMountedModes((current) =>
        current.video ? current : { ...current, video: true }
      );
      updateRoute('video', reusableReference.generationId);
    },
    [updateRoute]
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
    <div className="max-w-7xl mx-auto flex h-[calc(100vh-100px)] flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {mountedModes.image && (
          <div className={cn('h-full min-h-0', mode === 'image' ? 'block' : 'hidden')}>
            <ImageGenerationPage
              embedded
              isActive={mode === 'image'}
              createModeSwitcher={
                <CreateModeSwitcher mode={mode} onChange={handleTabChange} />
              }
              externalReference={imageReference}
              onClearExternalReference={() => setImageReference(null)}
              onReuseGeneration={handleReuseGeneration}
              onGenerationDeleted={clearReferenceForGeneration}
            />
          </div>
        )}
        {mountedModes.video && (
          <div className={cn('h-full min-h-0', mode === 'video' ? 'block' : 'hidden')}>
            <VideoGenerationView
              embedded
              isActive={mode === 'video'}
              createModeSwitcher={
                <CreateModeSwitcher mode={mode} onChange={handleTabChange} />
              }
              externalReference={videoReference}
              onExternalReferenceChange={setVideoReference}
            />
          </div>
        )}
      </div>
    </div>
  );
}
