import { describe, it, expect } from 'vitest';
import { resolveScorecardModel } from '../src/scorecard/cli.js';

describe('resolveScorecardModel', () => {
  it('reads --model <id> from argv', () => {
    expect(resolveScorecardModel(['--model', 'llama3.1:8b'], {})).toBe('llama3.1:8b');
  });

  it('ignores a bare trailing --model', () => {
    expect(resolveScorecardModel(['--model'], {})).toBeUndefined();
  });

  it('ignores --model followed by another flag', () => {
    expect(resolveScorecardModel(['--model', '--json', 'out.json'], {})).toBeUndefined();
  });

  it('falls back to SENSOR_HUMOR_SCORECARD_MODEL when no flag', () => {
    expect(resolveScorecardModel([], { SENSOR_HUMOR_SCORECARD_MODEL: 'qwen2.5:7b' })).toBe(
      'qwen2.5:7b',
    );
  });

  it('lets --model win over the env pin', () => {
    expect(
      resolveScorecardModel(['--model', 'llama3.1:8b'], {
        SENSOR_HUMOR_SCORECARD_MODEL: 'qwen2.5:7b',
      }),
    ).toBe('llama3.1:8b');
  });

  it('treats whitespace-only as unset', () => {
    expect(resolveScorecardModel(['--model', '   '], {})).toBeUndefined();
  });
});
