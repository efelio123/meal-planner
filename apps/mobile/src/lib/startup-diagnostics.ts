export type StartupDiagnostics = {
  requestId: string;
  record: (stage: string, elapsedMs: number, status?: number) => void;
};

const enabled = __DEV__ && process.env.EXPO_PUBLIC_STARTUP_TIMING_DIAGNOSTICS === 'true';

function createAnonymousRequestId(): string {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x1_0000_0000)
    .toString(16).padStart(8, '0')).join('');
}

const diagnostics: StartupDiagnostics | undefined = enabled
  ? {
    requestId: createAnonymousRequestId(),
    record(stage, elapsedMs, status) {
      const statusField = status === undefined ? '' : ` status=${status}`;
      console.info(`[startup-timing] request_id=${this.requestId} stage=${stage} elapsed_ms=${Math.max(0, elapsedMs).toFixed(1)}${statusField}`);
    },
  }
  : undefined;

export function getStartupDiagnostics(): StartupDiagnostics | undefined {
  return diagnostics;
}
