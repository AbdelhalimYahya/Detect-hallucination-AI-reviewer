// Pattern 5: Well-written, appropriately complex function
function parseLogLine(
  line: string
): { timestamp: Date; level: string; message: string; metadata: Record<string, string> } | null {
  const LOG_PATTERN = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\s+\[(\w+)\]\s+(.+?)(?:\s+--\s+(.*))?$/;
  const match = line.trim().match(LOG_PATTERN);

  if (!match) return null;

  const timestamp = new Date(match[1]);
  if (isNaN(timestamp.getTime())) return null;

  const level = match[2].toUpperCase();
  const validLevels = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);
  if (!validLevels.has(level)) return null;

  const message = match[3];
  const metadataStr = match[4];

  const metadata: Record<string, string> = {};
  if (metadataStr) {
    for (const pair of metadataStr.split(',')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (key) metadata[key] = value;
    }
  }

  return { timestamp, level, message, metadata };
}

function formatBytes(bytes: number): string {
  if (bytes < 0) throw new Error('Bytes must be non-negative');
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const base = 1024;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  const value = bytes / Math.pow(base, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number; maxDelayMs: number }
): Promise<T> {
  return fn().catch((err) => {
    const { maxRetries, baseDelayMs, maxDelayMs } = options;

    async function attempt(remaining: number): Promise<T> {
      if (remaining <= 0) throw err;
      const delay = Math.min(baseDelayMs * Math.pow(2, maxRetries - remaining), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
      return fn().catch((e) => {
        if (remaining - 1 <= 0) throw e;
        return attempt(remaining - 1);
      });
    }

    return attempt(maxRetries);
  });
}
