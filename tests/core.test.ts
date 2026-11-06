import { describe, it, expect } from 'vitest';
import { defaultParams, newProject } from '../src/engine/composer';
import { STYLES } from '../src/engine/styles';
import { totalBars } from '../src/engine/types';
import { buildProposal, interpret } from '../src/engine/assist';
import { Rng, euclid } from '../src/engine/theory';

describe('restored composition core', () => {
  for (const style of Object.keys(STYLES)) it(`creates editable ${style} arrangement`, () => {
    const p = newProject(defaultParams(style, 1337));
    expect(totalBars(p)).toBeGreaterThanOrEqual(96);
    expect(p.tracks.length).toBeGreaterThan(8);
    expect(p.tracks.filter(t => t.clips.some(c => c.notes.length)).length).toBeGreaterThan(8);
    expect(p.auto.length).toBeGreaterThan(0);
    expect(new Set(p.tracks.flatMap(t => t.clips.map(c => c.id))).size).toBe(p.tracks.flatMap(t => t.clips).length);
    expect(p.tracks.some(t => t.group === 'Transition' && t.clips.length)).toBe(true);
  });
  it('keeps proposals separate from committed notes', () => {
    const p = newProject(defaultParams()); const before = JSON.stringify(p);
    const proposal = buildProposal(p, 'Mute', 'test', { tracks: p.tracks.map(t => ({...t, mute:true})) });
    expect(proposal.preview.tracks.every(t=>t.mute)).toBe(true);
    expect(JSON.stringify(p)).toBe(before);
    expect(typeof interpret).toBe('function');
  });
  it('retains reproducible music theory utilities', () => {
    expect(new Rng(21).next()).toBe(new Rng(21).next());
    expect(euclid(5,16).filter(Boolean)).toHaveLength(5);
  });
});
