/**
 * Persist isolation helpers (F-631b66ce). Isolation is required for any file
 * that constructs Session or calls save()/addGag/resetSession/captureRow:
 * snapshot + delete these knobs at module load and in beforeAll, restore in
 * afterAll, so save()/captureRow cannot write ~/.sensor-humor or append the
 * operator's capture JSONL. Not wired as vitest setupFiles (config is
 * outside tests/**).
 */

const PERSIST_KEYS = [
  'SENSOR_HUMOR_PERSIST',
  'SENSOR_HUMOR_SESSION_DIR',
  'SENSOR_HUMOR_CAPTURE',
] as const;

export type PersistEnvSnapshot = {
  SENSOR_HUMOR_PERSIST: string | undefined;
  SENSOR_HUMOR_SESSION_DIR: string | undefined;
  SENSOR_HUMOR_CAPTURE: string | undefined;
};

export function snapshotPersistEnv(): PersistEnvSnapshot {
  return {
    SENSOR_HUMOR_PERSIST: process.env.SENSOR_HUMOR_PERSIST,
    SENSOR_HUMOR_SESSION_DIR: process.env.SENSOR_HUMOR_SESSION_DIR,
    SENSOR_HUMOR_CAPTURE: process.env.SENSOR_HUMOR_CAPTURE,
  };
}

export function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

export function isolatePersistEnv(): void {
  for (const key of PERSIST_KEYS) delete process.env[key];
}

export function restorePersistEnv(snapshot: PersistEnvSnapshot): void {
  restoreEnvVar('SENSOR_HUMOR_PERSIST', snapshot.SENSOR_HUMOR_PERSIST);
  restoreEnvVar('SENSOR_HUMOR_SESSION_DIR', snapshot.SENSOR_HUMOR_SESSION_DIR);
  restoreEnvVar('SENSOR_HUMOR_CAPTURE', snapshot.SENSOR_HUMOR_CAPTURE);
}
