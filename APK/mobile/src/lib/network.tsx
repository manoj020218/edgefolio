import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { App as CapApp } from '@capacitor/app';
import { getServerRoot } from './api';
import { getPendingCount, syncQueue } from './offlineQueue';

export type NetworkStatus = 'checking' | 'online' | 'offline';

interface NetworkStatusValue {
  status: NetworkStatus;
  pendingCount: number;
  syncing: boolean;
}

const NetworkStatusContext = createContext<NetworkStatusValue>({
  status: 'checking',
  pendingCount: 0,
  syncing: false,
});

export function useNetworkStatus(): NetworkStatusValue {
  return useContext(NetworkStatusContext);
}

const CHECK_INTERVAL_MS = 20000;

// EDGE is a PC on the local LAN, not a cloud service — "online" here means
// "EDGE itself answered /health just now", not just "this phone has some
// network". A phone can be on wifi with EDGE's PC off/closed/out of range,
// which is exactly the case this whole feature exists for.
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>('checking');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);

  async function refreshPendingCount() {
    setPendingCount(await getPendingCount());
  }

  async function checkOnce() {
    const root = await getServerRoot();
    if (!root) return; // server not configured yet (ServerSetupPage stage)
    try {
      const res = await fetch(`${root}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('unhealthy');
      setStatus('online');
      if (wasOffline.current) {
        wasOffline.current = false;
        setSyncing(true);
        await syncQueue(() => void refreshPendingCount());
        await refreshPendingCount();
        setSyncing(false);
      }
    } catch {
      wasOffline.current = true;
      setStatus('offline');
    }
  }

  useEffect(() => {
    void refreshPendingCount();
    void checkOnce();
    const interval = setInterval(() => void checkOnce(), CHECK_INTERVAL_MS);
    const subPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void checkOnce();
    });
    return () => {
      clearInterval(interval);
      void subPromise.then((s) => s.remove()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NetworkStatusContext.Provider value={{ status, pendingCount, syncing }}>
      {children}
    </NetworkStatusContext.Provider>
  );
}
