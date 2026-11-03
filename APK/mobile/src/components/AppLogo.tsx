import logo from '../assets/edgefolio-logo.png';

/** The real EdgeFolio app icon (same as the launcher icon) on a glowing white tile. */
export default function AppLogo({ size = 72 }: { size?: number }) {
  return (
    <div className="relative mb-5" style={{ width: size, height: size }}>
      <div className="absolute -inset-3 rounded-[32px] bg-brand opacity-50 blur-xl" aria-hidden />
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl bg-white shadow-glow ring-1 ring-white/40">
        <img src={logo} alt="EdgeFolio" className="h-[82%] w-[82%] object-contain" draggable={false} />
      </div>
    </div>
  );
}
