'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Image as ImageIcon, Video } from 'lucide-react';
import type { Generation } from '@/types';
import {
  buildReusableImageReference,
  buildReusableImageReferenceFromId,
  type ReusableImageReference,
} from '@/lib/generation-reference';
import { cn } from '@/lib/utils';

type CreateMode = 'image' | 'video';

const CreatePanelFallback = () => (
  <div className="surface flex h-full min-h-[24rem] items-center justify-center text-sm text-foreground/50">
    正在加载创作面板...
  </div>
);

const ImageGenerationPage = dynamic(
  () => import('@/components/generator/image-generation-page').then((mod) => mod.ImageGenerationPage),
  {
    ssr: false,
    loading: CreatePanelFallback,
  }
);

const VideoGenerationView = dynamic(
  () => import('@/components/generator/video-generation-page').then((mod) => mod.VideoGenerationView),
  {
    ssr: false,
    loading: CreatePanelFallback,
  }
);

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
    description: '视频生成',
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
    <div className="relative inline-flex w-full flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-background/40 p-1 sm:w-auto sm:flex-nowrap shadow-[inset_0_1px_4px_rgba(0,0,0,0.4)] backdrop-blur-md">
      {CREATE_TABS.map((tab) => {
        const isActive = mode === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold tracking-wide transition-all duration-300 sm:min-w-[130px] overflow-hidden',
              isActive
                ? 'bg-gradient-to-br from-sky-500/15 to-indigo-500/10 text-sky-400 border border-sky-500/25 shadow-[0_2px_10px_rgba(0,0,0,0.2)]'
                : 'text-foreground/45 hover:text-foreground/75 hover:bg-card/40 border border-transparent'
            )}
          >
            {isActive && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-sky-400 to-indigo-500 shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
            )}
            <tab.icon className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-300', isActive ? 'scale-110 text-sky-400' : 'text-foreground/45')} />
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
        updateRoute('image', reusableReference.generationId);
        return;
      }

      setVideoReference(reusableReference);
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
        <div className={cn('h-full min-h-0')}>
          {mode === 'image' ? (
            <ImageGenerationPage
              embedded
              isActive
              createModeSwitcher={
                <CreateModeSwitcher mode={mode} onChange={handleTabChange} />
              }
              externalReference={imageReference}
              onClearExternalReference={() => setImageReference(null)}
              onReuseGeneration={handleReuseGeneration}
              onGenerationDeleted={clearReferenceForGeneration}
            />
          ) : (
            <VideoGenerationView
              embedded
              isActive
              createModeSwitcher={
                <CreateModeSwitcher mode={mode} onChange={handleTabChange} />
              }
              externalReference={videoReference}
              onExternalReferenceChange={setVideoReference}
            />
          )}
        </div>
      </div>
    </div>
  );
}
