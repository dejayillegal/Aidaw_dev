import { useMemo, useRef, useState, useEffect } from 'react';
import { store, useApp, engine } from '../store';
import { QUICK_ACTIONS, fixFor } from '../engine/assist';
import { diagnose } from '../engine/diagnostics';
import { acceptProposal, rejectProposal, runAssist } from '../actions';
import { Btn, Badge } from '../ui';
import { cn } from '../utils/cn';

const SEV = { crit: '#ef4444', warn: '#f59e0b', info: '#64748b' } as const;

function Meter({ label, v }: { label: string; v: number }) {
  return (
    <div title={`${label}: ${Math.round(v * 100)}%`}>
      <div className="flex justify-between text-[9px] uppercase tracking-wider text-slate-500"><span>{label}</span><span className="font-mono text-slate-300">{Math.round(v * 100)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#0e1216]"><div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: v > 0.66 ? '#22c55e' : v > 0.4 ? '#f59e0b' : '#ef4444' }} /></div>
    </div>
  );
}

export function Assist() {
  const app = useApp(); const [text, setText] = useState(''); const end = useRef<HTMLDivElement>(null);
  const report = useMemo(() => diagnose(app.project), [app.project]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [app.log.length, app.proposals.length]);
  const send = () => { runAssist(text); setText(''); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        <div className="rounded-md border border-line bg-panel p-2">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Composition diagnostics <span className="font-normal normal-case tracking-normal text-slate-600">live</span></div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5"><Meter label="Section differentiation" v={report.differentiation} /><Meter label="Layer independence" v={report.independence} /><Meter label="Transition coverage" v={report.coverage} /><Meter label="Gain staging (est.)" v={report.headroom} /></div>
          <div className="mt-2 space-y-1">
            {report.issues.length === 0 && <div className="text-[11px] text-emerald-400">✓ No structural or mix issues detected.</div>}
            {report.issues.map((i) => (
              <div key={i.id} className="flex items-start gap-1.5 rounded border border-line bg-bg px-1.5 py-1 text-[10px] leading-snug">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEV[i.sev] }} /><span className="flex-1 text-slate-300">{i.text}</span>
                {i.fix && <Btn small tone="cyan" onClick={() => store.propose(() => fixFor(app.project, i.fix!))}>Fix</Btn>}
              </div>
            ))}
          </div>
        </div>

        {app.proposals.map((pr) => {
          const active = app.previewId === pr.id;
          return (
            <div key={pr.id} className={cn('rounded-md border p-2', active ? 'border-cyan bg-cyan/5' : 'border-line bg-panel')}>
              <div className="flex items-start justify-between gap-2"><div className="text-[11px] font-semibold text-slate-100">{pr.title}</div><Badge color="#06b6d4">AI diff</Badge></div>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{pr.rationale}</p>
              <div className="mt-1.5 flex gap-2 font-mono text-[10px]"><span className="text-cyan">+{pr.stats.added}</span><span className="text-red-400">−{pr.stats.removed}</span><span className="text-amber">~{pr.stats.changed}</span><span className="text-slate-400">{pr.stats.lanes} lanes</span><span className="text-slate-400">{pr.stats.mixer} mixer</span></div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Btn small active={active} onClick={() => store.setPreview(active ? null : pr.id)}>{active ? 'Hide ghost' : 'Show ghost'}</Btn>
                <Btn small active={active && app.audition} disabled={!active} onClick={() => { store.setAudition(!app.audition); if (engine.playing) void engine.play(Math.max(0, engine.getStep() / 16)); else void store.play(); }}>{app.audition && active ? '■ Auditioning' : '▶ Audition'}</Btn>
                <Btn small tone="cyan" onClick={() => acceptProposal(pr.id)}>Accept</Btn><Btn small tone="ghost" onClick={() => rejectProposal(pr.id)}>Reject</Btn>
              </div>
            </div>
          );
        })}

        {app.log.map((m) => (
          <div key={m.id} className={cn('rounded-md px-2 py-1.5 text-[11px] leading-snug', m.role === 'user' ? 'ml-6 bg-elev text-slate-200' : 'mr-4 border border-line bg-panel text-slate-300')}>{m.text}</div>
        ))}
        <div ref={end} />
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <div className="mb-1.5 flex max-h-[68px] flex-wrap gap-1 overflow-y-auto">
          {QUICK_ACTIONS.map((q) => <button key={q} onClick={() => runAssist(q)} className="rounded-full border border-line bg-elev px-2 py-0.5 text-[10px] text-slate-300 hover:border-cyan hover:text-cyan">{q}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-1.5">
          <input aria-label="Assist command" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Create a 16-bar tension reduction at bar 97…" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-elev px-2 text-[12px] placeholder:text-slate-600" style={{ userSelect: 'text' }} />
          <Btn tone="cyan" onClick={send}>Run</Btn>
        </form>
      </div>
    </div>
  );
}
