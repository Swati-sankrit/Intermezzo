// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHOICE_KEY, loadChoice, saveChoice } from '../storage';
import type { AttentionStore } from '../types';

describe('attention choice storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round trips both valid values', () => {
    expect(saveChoice('camera')).toBe(true);
    expect(localStorage.getItem(CHOICE_KEY)).toBe('camera');
    expect(loadChoice()).toBe('camera');
    expect(saveChoice('no-camera')).toBe(true);
    expect(loadChoice()).toBe('no-camera');
  });

  it('uses the key rod_attention_choice', () => {
    expect(CHOICE_KEY).toBe('rod_attention_choice');
  });

  it('returns null when nothing is stored', () => {
    expect(loadChoice()).toBeNull();
  });

  it.each(['', 'yes', 'Camera', 'true', '{"a":1}'])('returns null for stored value %j', (v) => {
    localStorage.setItem(CHOICE_KEY, v);
    expect(loadChoice()).toBeNull();
  });

  it('returns null when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadChoice()).toBeNull();
  });

  it('returns false and does not throw when writing fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(saveChoice('camera')).toBe(false);
  });

  it('matches the AttentionStore choice shape', () => {
    const pick: Pick<AttentionStore, 'loadChoice' | 'saveChoice'> = { loadChoice, saveChoice };
    expect(pick.saveChoice('no-camera')).toBe(true);
    expect(pick.loadChoice()).toBe('no-camera');
  });
});
