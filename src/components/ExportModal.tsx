import { useRef, useState } from 'react';
import { store } from '../store';
import { renderWav, type ExportResult, type ExportState } from '../engine/audio';
import { Btn } from '../ui';
import { cn } from '../utils/cn';

const STEPS: ExportState[] = ['VALIDATING', 'PREPARING', 'RENDERING', 'PROCESSING', 'ENCODING', 'SAVING', 'VERIFYING', 'COMPLETED'];

export function ExportModal({ onClose }: { onClose: () => void }) {
  const [sr, setSr] = useState(44100); const [bits, setBits] = useState<16 | 24 | 32>(24);
  const [state, setState] = useState<ExportState>('IDLE'); const [prog, setProg] = useState(0); const [err, setErr] = useState(''); const [res, setRes] = useState<ExportResult | null>(null);
  const cancel = useRef(false); const url = useRef('');
  const busy = state !== 'IDLE' && state !== 'COMPLETED' && state !== 'FAILED' && state !== 'CANCELLED';

  const start = async () => {
    cancel.current = false; setErr(''); setRes(null); store.stop();
    try {
      const r = await renderWav(store.get().project, { sampleRate: sr, bits, cancelled: () => cancel.current, onState: (s, p) => { setState(s); setProg(p); } });
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(r.blob); setRes(r); setState('COMPLETED'); setProg(1);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m === 'CANCELLED') setState('CANCELLED'); else { setState('FAILED'); setErr(m); }
    }
  };
  const name = `${store.get().project.name.replace(/[^\w.-]+/g, '_')}_${sr / 1000}k_${bits}${bits === 32 ? 'f' : ''}.wav`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Export WAV">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-bold">Export · Offline WAV render</h2><Btn small tone="ghost" onClick={() => !busy && onClose()}>✕</Btn></div>
        <p className="mb-3 text-[11px] leading-snug text-slate-400">Renders the full arrangement through the <b>same scheduler, synths, automation and sidechain graph</b> as live playback (OfflineAudioContext, windowed scheduling with real progress). Stem and MIDI export are not implemented yet.</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] uppercase tracking-wider text-slate-400">Sample rate<select disabled={busy} value={sr} onChange={(e) => setSr(+e.target.value)} className="mt-0.5 w-full text-[12px]"><option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option></select></label>
          <label className="text-[10px] uppercase tracking-wider text-slate-400">Bit depth<select disabled={busy} value={bits} onChange={(e) => setBits(+e.target.value as 16 | 24 | 32)} className="mt-0.5 w-full text-[12px]"><option value={16}>16-bit PCM</option><option value={24}>24-bit PCM</option><option value={32}>32-bit float</option></select></label>
        </div>
        <ol className="mb-3 grid grid-cols-4 gap-1 text-[9px]">{STEPS.map((s) => { const i = STEPS.indexOf(s), c = STEPS.indexOf(state === 'FAILED' || state === 'CANCELLED' || state === 'IDLE' ? 'VALIDATING' : state); const done = state === 'COMPLETED' || (state !== 'IDLE' && i < c); const cur = s === state; return <li key={s} className={cn('rounded px-1 py-0.5 text-center', done ? 'bg-emerald-500/20 text-emerald-300' : cur ? 'bg-amber/20 text-amber pulse' : 'bg-elev text-slate-500')}>{s}</li>; })}</ol>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#0b0e12]"><div className="h-full bg-amber transition-[width]" style={{ width: `${prog * 100}%` }} /></div>
        {state === 'FAILED' && <div className="mb-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-[11px] text-red-300">FAILED: {err}</div>}
        {state === 'CANCELLED' && <div className="mb-3 text-[11px] text-slate-400">Cancelled.</div>}
        {res && (
          <div className="mb-3 space-y-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 font-mono text-[10px] text-emerald-200">
            <div>✓ verified · {res.seconds.toFixed(1)} s · {res.frames.toLocaleString()} frames {res.frames === res.expectedFrames ? '(exact)' : `(expected ${res.expectedFrames})`}</div>
            <div>peak {res.peakDb.toFixed(2)} dBFS · RMS {res.rmsDb.toFixed(1)} dBFS · {(res.blob.size / 1048576).toFixed(1)} MB</div>
            <div>sidechain: {res.sc === 'worklet' ? 'AudioWorklet (true key input)' : 'scheduled-envelope fallback'}</div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {busy ? <Btn onClick={() => (cancel.current = true)}>Cancel</Btn> : <Btn tone="amber" onClick={start}>{state === 'COMPLETED' ? 'Render again' : 'Render WAV'}</Btn>}
          {res && <a href={url.current} download={name} className="inline-flex h-8 items-center rounded-md border border-cyan bg-cyan/90 px-3 text-[11px] font-semibold text-black">Download</a>}
        </div>
      </div>
    </div>
  );
}
