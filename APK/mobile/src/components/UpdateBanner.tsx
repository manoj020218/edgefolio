import { useCallback, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AppUpdate, AppUpdateAvailability, FlexibleUpdateInstallStatus } from '@capawesome/capacitor-app-update';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { apiGet } from '../lib/api';
import { celebrate } from '../lib/feedback';

// Google Play in-app updates (Play-installed copies only):
//  • a newer version on Play → slim "Update available" banner; tapping downloads it in the
//    background (Play's flexible update), then "Restart to update" installs it.
//  • the server's min_apk_version is newer than this app → Play's full-screen required update
//    (falls back to opening the Play Store page).
// Checked at start and whenever the app returns to the foreground; "Later" hides it for 12 hours.

type State = 'idle' | 'available' | 'downloading' | 'ready';
const SNOOZE_KEY = 'edgefolio.updateSnoozedUntil';

function older(current: string, minimum: string): boolean {
  const a = current.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

export default function UpdateBanner() {
  const [state, setState] = useState<State>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const check = useCallback(async () => {
    if (Capacitor.getPlatform() !== 'android') return;
    try {
      const info = await AppUpdate.getAppUpdateInfo();
      if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) { setState('ready'); return; }
      if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return;
      setVersion(info.availableVersionName || null);

      // Required update when the server says this version is too old.
      const cfg = await apiGet<{ min_apk_version?: string }>('/config').catch(() => null);
      const current = (await CapApp.getInfo()).version;
      if (cfg?.min_apk_version && older(current, cfg.min_apk_version)) {
        if (info.immediateUpdateAllowed) await AppUpdate.performImmediateUpdate();
        else await AppUpdate.openAppStore();
        return;
      }
      let snoozed = 0;
      try { snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { /* ignore */ }
      if (Date.now() < snoozed) return;
      setState((s) => (s === 'idle' ? 'available' : s));
    } catch {
      // Not installed from Play (sideloaded / debug) or Play services unavailable: nothing to show.
    }
  }, []);

  useEffect(() => {
    void check();
    const resume = CapApp.addListener('resume', () => void check());
    const flex = AppUpdate.addListener('onFlexibleUpdateStateChange', (st) => {
      if (st.installStatus === FlexibleUpdateInstallStatus.DOWNLOADING && st.totalBytesToDownload) {
        setProgress(Math.round(((st.bytesDownloaded || 0) / st.totalBytesToDownload) * 100));
      }
      if (st.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) { setState('ready'); celebrate('already'); }
      if (st.installStatus === FlexibleUpdateInstallStatus.FAILED || st.installStatus === FlexibleUpdateInstallStatus.CANCELED) setState('available');
    });
    return () => { void resume.then((h) => h.remove()); void flex.then((h) => h.remove()); };
  }, [check]);

  async function startUpdate() {
    try {
      const info = await AppUpdate.getAppUpdateInfo();
      if (info.flexibleUpdateAllowed) { setState('downloading'); setProgress(0); await AppUpdate.startFlexibleUpdate(); }
      else if (info.immediateUpdateAllowed) await AppUpdate.performImmediateUpdate();
      else await AppUpdate.openAppStore();
    } catch {
      void AppUpdate.openAppStore().catch(() => {});
      setState('available');
    }
  }

  function later() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 12 * 3600 * 1000)); } catch { /* ignore */ }
    setState('idle');
  }

  if (state === 'idle') return null;

  return (
    <div className="fixed inset-x-3 z-50 animate-enter" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <div className="glass-strong flex items-center gap-3 rounded-2xl border border-brand-500/40 bg-[#11131c]/90 px-3.5 py-2.5 shadow-glow backdrop-blur-xl">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white">
          {state === 'ready' ? <RefreshCw size={15} /> : state === 'downloading' ? <Download size={15} className="animate-bounce" /> : <Sparkles size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-100">
            {state === 'ready' ? 'Update downloaded' : state === 'downloading' ? `Downloading update… ${progress}%` : 'New version available'}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {state === 'ready' ? 'Restart the app to finish updating' : version ? `EdgeFolio ${version}` : 'Get the latest features and fixes'}
          </p>
        </div>
        {state === 'available' && (
          <>
            <button onClick={() => void startUpdate()} className="btn-primary px-3 py-1.5 text-xs">Update</button>
            <button onClick={later} aria-label="Later" className="rounded-full p-1.5 text-slate-400"><X size={15} /></button>
          </>
        )}
        {state === 'ready' && (
          <button onClick={() => void AppUpdate.completeFlexibleUpdate()} className="btn-primary px-3 py-1.5 text-xs">Restart</button>
        )}
      </div>
    </div>
  );
}
