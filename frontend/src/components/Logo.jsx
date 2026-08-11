import { useState } from 'react';
import { Infinity as InfinityIcon } from 'lucide-react';
import { cn } from './ui';

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-lg', icon: 18 },
  md: { box: 'h-10 w-10 rounded-xl', icon: 22 },
  lg: { box: 'h-14 w-14 rounded-2xl', icon: 30 },
  xl: { box: 'h-12 w-12 rounded-xl', icon: 26 },
};

const SOURCES = ['/logo-icon.png', '/logo.png'];

export default function Logo({ size = 'md', withWordmark = false, className }) {
  const s = SIZES[size] || SIZES.md;
  const [src, setSrc] = useState(SOURCES[0]);
  const [failed, setFailed] = useState(false);

  const mark = failed ? (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden',
        'bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600',
        'shadow-lg shadow-orange-500/30',
        s.box
      )}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.35),transparent_60%)]" />
      <InfinityIcon className="relative text-white" size={s.icon} strokeWidth={2.4} />
    </span>
  ) : (
    <img
      src={src}
      alt="Phishloop logo"
      className={cn('shrink-0 object-contain', s.box)}
      onError={() => {
        const i = SOURCES.indexOf(src);
        if (i < SOURCES.length - 1) setSrc(SOURCES[i + 1]);
        else setFailed(true);
      }}
    />
  );

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {mark}
      {withWordmark && (
        <span className="leading-tight">
          <span className="block font-display text-base font-bold text-white">Phishloop</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
            Human risk platform
          </span>
        </span>
      )}
    </div>
  );
}
