'use client';

import dynamic from 'next/dynamic';

const VideoGenerationPage = dynamic(
  () => import('@/components/generator/video-generation-page'),
  {
    ssr: false,
    loading: () => (
      <div className="surface flex h-full min-h-[24rem] items-center justify-center text-sm text-foreground/50">
        正在加载创作面板...
      </div>
    ),
  }
);

export default function Page() {
  return <VideoGenerationPage />;
}
