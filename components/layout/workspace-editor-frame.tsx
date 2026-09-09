import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function WorkspaceEditorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex relative z-10 min-h-screen">
      <aside className="fixed left-0 top-0 bottom-0 w-12 border-r border-border/70 bg-card/70 backdrop-blur">
        <Link
          href="/workspace"
          className="mt-4 ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-foreground/70 transition hover:border-border hover:text-foreground"
          title="返回工作空间"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </aside>
      <main className="flex-1 min-w-0 ml-12 p-0 h-screen overflow-hidden">
        <div className="animate-rise">{children}</div>
      </main>
    </div>
  );
}
