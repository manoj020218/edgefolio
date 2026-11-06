import { useEffect, useState } from 'react';
import { apiGet, apiGetFull, isCloudModeSync } from './api';

// Approvals / Leave types exist only for app-only cloud companies (PC-linked ones approve in EdgeFolio for Windows).
// Returns whether to show the entries and the pending approvals count (0 until known).
export function useApprovalsInfo(): { available: boolean; pendingCount: number } {
  const [state, setState] = useState({ available: false, pendingCount: 0 });
  useEffect(() => {
    if (!isCloudModeSync()) return;
    let cancelled = false;
    apiGet<{ linkedToPc?: boolean }>('/company')
      .then(async (c) => {
        if (cancelled || c.linkedToPc) return;
        let pendingCount = 0;
        try {
          const { meta } = await apiGetFull<unknown>('/approvals', { status: 'pending' });
          pendingCount = Number((meta as { pendingCount?: number } | undefined)?.pendingCount ?? 0);
        } catch { /* ignore */ }
        if (!cancelled) setState({ available: true, pendingCount });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return state;
}
