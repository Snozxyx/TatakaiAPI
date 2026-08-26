type ProxyHealth = {
  id: string;
  url: string;
  failures: number;
  successes: number;
  lastLatencyMs: number;
  cooldownUntil: number;
  lastFailureStatus?: number;
  lastFailureAt?: number;
};

const DEFAULT_TIMEOUT_MS = 12000;
const COOLDOWN_BASE_MS = 16000;
const MAX_COOLDOWN_MS = 45000;
const COOLDOWN_AFTER_FAILURES = 3;

export class ProxyBalancer {
  private nodes: ProxyHealth[];
  private rotationCursor = 0;

  constructor(urls: string[]) {
    this.nodes = urls
      .map((url, index) => ({
        id: `proxy-${index + 1}`,
        url: url.trim(),
        failures: 0,
        successes: 0,
        lastLatencyMs: 0,
        cooldownUntil: 0,
      }))
      .filter((node) => node.url.length > 0);
  }

  get hasNodes() {
    return this.nodes.length > 0;
  }

  getStats() {
    return this.nodes;
  }

  private score(node: ProxyHealth): number {
    if (node.cooldownUntil > Date.now()) return Number.POSITIVE_INFINITY;
    return (node.lastLatencyMs || 100) + node.failures * 320;
  }

  private pickNode(): ProxyHealth | null {
    if (!this.nodes.length) return null;
    const sorted = [...this.nodes].sort((a, b) => this.score(a) - this.score(b));
    const topCandidates = sorted.slice(0, Math.min(2, sorted.length));
    const selected = topCandidates[this.rotationCursor % topCandidates.length] || topCandidates[0];
    this.rotationCursor = (this.rotationCursor + 1) % topCandidates.length;
    return selected;
  }

  private reportSuccess(node: ProxyHealth, latencyMs: number) {
    node.successes += 1;
    node.failures = Math.max(0, node.failures - 1.25);
    node.lastLatencyMs = Math.round(latencyMs);
    node.cooldownUntil = 0;
  }

  private reportFailure(node: ProxyHealth, status?: number) {
    node.lastFailureStatus = status;
    node.lastFailureAt = Date.now();
    node.failures += 1;
    if (node.failures >= COOLDOWN_AFTER_FAILURES) {
      const factor = Math.min(Math.floor(node.failures), 6);
      node.cooldownUntil = Date.now() + Math.min(COOLDOWN_BASE_MS + factor * 2000, MAX_COOLDOWN_MS);
    }
  }

  async fetch(
    url: string,
    init?: RequestInit,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    proxyParams?: Record<string, string | number | boolean | undefined>,
  ): Promise<Response> {
    if (!this.nodes.length) return fetch(url, init);

    const attempted = new Set<string>();
    let lastError: Error | null = null;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.pickNode();
      if (!node || attempted.has(node.id)) continue;
      attempted.add(node.id);

      const query = new URLSearchParams({ url });
      if (proxyParams) {
        for (const [key, value] of Object.entries(proxyParams)) {
          if (value === undefined || value === null || value === "") continue;
          query.set(key, String(value));
        }
      }

      const proxyUrl = `${node.url}${node.url.includes("?") ? "&" : "?"}${query.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const start = performance.now();

      try {
        const resp = await fetch(proxyUrl, {
          ...init,
          headers: { ...init?.headers, "X-Proxy-Hop": "1" },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          this.reportFailure(node, resp.status);
          lastError = new Error(`Proxy ${node.id} failed with ${resp.status}`);
          continue;
        }

        this.reportSuccess(node, performance.now() - start);
        return resp;
      } catch (err) {
        clearTimeout(timeout);
        this.reportFailure(node);
        lastError = err as Error;
      }
    }

    throw lastError || new Error("No healthy proxy available");
  }
}