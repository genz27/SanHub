'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardBackground } from './dashboard-background';

export function DashboardBackgroundWrapper() {
  const pathname = usePathname();
  const reducedEffects =
    pathname.startsWith('/create') ||
    pathname.startsWith('/image') ||
    pathname.startsWith('/video') ||
    pathname.startsWith('/history');

  useEffect(() => {
    document.body.classList.toggle('dashboard-reduced-effects', reducedEffects);

    return () => {
      document.body.classList.remove('dashboard-reduced-effects');
    };
  }, [reducedEffects]);

  return <DashboardBackground reducedEffects={reducedEffects} />;
}
