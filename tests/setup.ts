/**
 * Persist isolation helpers (F-631b66ce). Each file that calls resetSession must
 * snapshot + delete these knobs in beforeAll and restore in afterAll so save()
 * cannot write ~/.sensor-humor. Not wired as vitest setupFiles (config is
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
