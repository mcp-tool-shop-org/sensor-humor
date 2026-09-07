/**
 * Scorecard CLI flag parsing (Feature Pass FP-4).
 *
 * `--model <id>` pins ONE model for the whole live scorecard run (same-base A/B harness).
 * It is NOT live per-mood routing — SENSOR_HUMOR_MODEL_MAP is a WON'T.
 */

/**
 * Resolve the model pin for a scorecard process.
 * `--model <id>` wins; otherwise undefined so getModel() keeps reading SENSOR_HUMOR_MODEL.
 */
export function resolveScorecardModel(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): string | undefined {
  const flagIdx = argv.indexOf('--model');
  if (flagIdx !== -1) {
    const next = argv[flagIdx + 1];
    if (next && !next.startsWith('--')) {
      const trimmed = next.trim();
      return trimmed === '' ? undefined : trimmed;
    }
  }
  const envPin = env.SENSOR_HUMOR_SCORECARD_MODEL?.trim();
  return envPin ? envPin : undefined;
}
