'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AgentListPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/agents/creative-assistant');
  }, [router]);

  return null;
}
