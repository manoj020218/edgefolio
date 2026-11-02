import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { apiGet } from './api';
import { celebrate } from './feedback';
import { useAuth } from './auth';

// Unread count for the in-app notifications inbox (GET /notifications/unread-count), shared by the
// bell badges. Refreshes every 30 s, when the app comes back to the foreground, and on demand.
// When the count goes UP while the app is open, a soft chime/buzz plays (the system notification
// may be suppressed in the foreground on some phones).

interface Ctx { unread: number; refresh: () => void }
const NotificationsContext = createContext<Ctx>({ unread: 0, refresh: () => {} });

export function NotificationsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const last = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    apiGet<{ unread: number }>('/notifications/unread-count')
      .then(({ unread: n }) => {
        if (last.current !== null && n > last.current) celebrate('already');
        last.current = n;
        setUnread(n);
      })
      .catch(() => { /* older server or offline: keep the last value */ });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setUnread(0); last.current = null; return; }
    refresh();
    const t = setInterval(refresh, 30_000);
    const sub = App.addListener('resume', refresh);
    return () => { clearInterval(t); void sub.then((s) => s.remove()); };
  }, [enabled, refresh]);

  return <NotificationsContext.Provider value={{ unread, refresh }}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);

/** Provider that is active only while someone is logged in. */
export function AuthedNotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <NotificationsProvider enabled={Boolean(user)}>{children}</NotificationsProvider>;
}
