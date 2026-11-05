import { useEffect, useState, type ReactNode } from 'react';
import { cn } from './utils/cn';

export function Slider({ label, value, min, max, step = 0.01, onChange, fmt, disabled, cy, hint }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; disabled?: boolean; cy?: boolean; hint?: string;
}) {
  return (
    <label className={cn('block', disabled && 'opacity-40')} title={hint}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>{label}</span><span className="font-mono text-slate-200 normal-case tracking-normal">{fmt ? fmt(value) : value.toFixed(2)}</span>
      </div>
      <input aria-label={label} type="range" className={cn(cy && 'cy')} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Btn({ children, onClick, active, tone = 'default', className, title, disabled, small }: {
  children: ReactNode; onClick?: () => void; active?: boolean; tone?: 'default' | 'amber' | 'cyan' | 'red' | 'ghost'; className?: string; title?: string; disabled?: boolean; small?: boolean;
}) {
  const tones = {
    default: 'bg-elev border-line hover:bg-[#232b35] text-slate-200',
    amber: 'bg-amber/90 border-amber text-black hover:bg-amber font-semibold',
    cyan: 'bg-cyan/90 border-cyan text-black hover:bg-cyan font-semibold',
    red: 'bg-red-500/90 border-red-400 text-white hover:bg-red-500',
    ghost: 'bg-transparent border-transparent hover:bg-elev text-slate-300',
  };
  return (
    <button title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={cn('inline-flex items-center justify-center gap-1 rounded-md border px-2 transition-colors disabled:opacity-40 disabled:pointer-events-none select-none', small ? 'h-6 text-[10px]' : 'h-8 text-[11px]', tones[tone], active && 'ring-1 ring-amber !border-amber text-amber', className)}>
      {children}
    </button>
  );
}

export function Section({ title, children, right, className }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-line px-3 py-2.5', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</h3>{right}
      </div>
      {children}
    </section>
  );
}

export const Badge = ({ children, color = '#64748b' }: { children: ReactNode; color?: string }) => (
  <span className="rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider" style={{ background: color + '33', color }}>{children}</span>
);

export function useMedia(q: string) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : true));
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); f(); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}

export const fmtDb = (v: number) => `${v.toFixed(1)} dB`;
export const barText = (bar: number) => `${Math.floor(bar) + 1}.${Math.floor((bar % 1) * 4) + 1}`;
