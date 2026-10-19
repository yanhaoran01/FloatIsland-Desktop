/* FloatIsland contributors. GPL-3.0. */
/** @file agentHudUsage.ts @description Numeric usage persistence, replay deduplication and rolling windows. @author 鸡哥 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname } from 'path';
import type {
  HudAgentId,
  HudTokenTotals,
  HudQuota
} from '../../preload/types/agentHud';

export const DAY = 86_400_000;
const zero = (): HudTokenTotals => ({
  input: 0,
  output: 0,
  cached: 0,
  reasoning: 0,
  total: 0
});
type Usage = HudTokenTotals & { id: string; agent: HudAgentId; at: number };
type QuotaSample = HudQuota & {
  previous?: { at: number; used: number; reset: number | null };
};
const number = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
/** Keeps cached and reasoning tokens within their parent input and output counters. */
export function normalizeTokens(
  raw: Record<string, unknown>,
  anthropic = false
): HudTokenTotals {
  const cached = number(
    raw.cached ??
      raw.cachedInputTokens ??
      raw.cached_input_tokens ??
      (raw.prompt_tokens_details as any)?.cached_tokens ??
      raw.cache_read_input_tokens
  );
  const input =
    number(
      raw.input ??
        raw.inputTokens ??
        raw.input_tokens ??
        raw.prompt_tokens ??
        raw.prompt_eval_count
    ) + (anthropic ? cached + number(raw.cache_creation_input_tokens) : 0);
  const output = number(
    raw.output ??
      raw.outputTokens ??
      raw.output_tokens ??
      raw.completion_tokens ??
      raw.eval_count
  );
  return {
    input,
    output,
    cached: Math.min(input, cached),
    reasoning: Math.min(
      output,
      number(
        raw.reasoning ??
          raw.reasoningOutputTokens ??
          raw.reasoning_output_tokens ??
          (raw.completion_tokens_details as any)?.reasoning_tokens
      )
    ),
    total: input + output
  };
}
/** Stores numeric observations only. Event identities are irreversible hashes. */
export class HudUsageLedger {
  private events = new Map<string, Usage>();
  private quotas: QuotaSample[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private startedAt: number;
  constructor(
    private path: string,
    private now: () => number = Date.now
  ) {
    this.startedAt = now();
    try {
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      if (saved.version === 1) {
        if (Number.isFinite(saved.startedAt)) this.startedAt = saved.startedAt;
        for (const e of saved.events ?? [])
          if (
            typeof e.id === 'string' &&
            /^[a-f0-9]{64}$/.test(e.id) &&
            Number.isFinite(e.at) &&
            e.at <= now() + 60_000 &&
            e.at > now() - DAY * 2 &&
            [
              'codex',
              'dsh',
              'claude',
              'workbuddy',
              'openai',
              'anthropic',
              'ollama'
            ].includes(e.agent) &&
            Object.values(normalizeTokens(e)).every(Number.isFinite)
          )
            this.events.set(e.id, {
              ...normalizeTokens(e),
              id: e.id,
              agent: e.agent,
              at: e.at
            });
        this.quotas = (saved.quotas ?? []).filter(
          (q: QuotaSample) =>
            Number.isFinite(q.usedPercent) &&
            q.usedPercent >= 0 &&
            q.usedPercent <= 100 &&
            Number.isFinite(q.updatedAt)
        );
      }
    } catch {
      /* Missing or invalid statistics are rebuilt from observed events. */
    }
  }
  record(
    agent: HudAgentId,
    identity: string,
    at: number,
    tokens: HudTokenTotals
  ): void {
    if (
      !Number.isFinite(at) ||
      at < this.now() - DAY * 2 ||
      at > this.now() + 60_000 ||
      tokens.total <= 0
    )
      return;
    const id = createHash('sha256')
      .update(agent + ':' + identity)
      .digest('hex');
    const previous = this.events.get(id);
    // Late log replay supplies the original event time instead of receipt time.
    const event = {
      id,
      agent,
      at: previous ? Math.min(at, previous.at) : at,
      ...tokens
    };
    if (previous && JSON.stringify(previous) === JSON.stringify(event)) return;
    this.events.set(id, event);
    this.startedAt = Math.min(this.startedAt, at);
    this.changed();
  }
  codex(session: string, usage: Record<string, unknown>, at: number): void {
    const total = usage.total ?? usage.total_token_usage,
      last = usage.last ?? usage.last_token_usage;
    if (!total || !last) return;
    const cumulative = normalizeTokens(total as Record<string, unknown>);
    this.record(
      'codex',
      session + ':' + JSON.stringify(cumulative),
      at,
      normalizeTokens(last as Record<string, unknown>)
    );
  }
  rateLimits(value: Record<string, unknown>, at = this.now()): void {
    const limits = (value.rateLimits ?? value) as Record<string, unknown>;
    const map = value.rateLimitsByLimitId as
      | Record<string, unknown>
      | undefined;
    const sets =
      map && Object.keys(map).length
        ? Object.entries(map)
        : [['account', limits] as const];
    const next: QuotaSample[] = [];
    for (const [group, raw] of sets)
      for (const name of ['primary', 'secondary']) {
        const window = (raw as Record<string, unknown>)?.[name] as
          | Record<string, unknown>
          | undefined;
        if (
          !window ||
          typeof window.usedPercent !== 'number' ||
          !Number.isFinite(window.usedPercent)
        )
          continue;
        const id = group + ':' + name,
          used = Math.max(0, Math.min(100, window.usedPercent)),
          reset =
            typeof window.resetsAt === 'number' ? window.resetsAt * 1000 : null;
        const old = this.quotas.find((q) => q.id === id);
        if (old && at < old.updatedAt) {
          next.push(old);
          continue;
        }
        const continuous =
          old &&
          reset !== null &&
          old.resetsAt === reset &&
          used >= old.usedPercent &&
          at - old.updatedAt <= 15 * 60_000 &&
          reset > at;
        const previous = continuous
          ? (old.previous ?? {
              at: old.updatedAt,
              used: old.usedPercent,
              reset
            })
          : { at, used, reset };
        const elapsed = at - previous.at;
        const rate =
          continuous && elapsed >= 15_000
            ? (used - previous.used) / (elapsed / 3_600_000)
            : continuous
              ? old.usedPerHour
              : null;
        next.push({
          previous: elapsed >= 60_000 ? { at, used, reset } : previous,
          id,
          label: group === 'account' ? name : group + ' · ' + name,
          usedPercent: used,
          resetsAt: reset,
          windowMinutes:
            typeof window.windowDurationMins === 'number'
              ? window.windowDurationMins
              : null,
          updatedAt: at,
          shared: true,
          usedPerHour: rate
        });
      }
    if (next.length) {
      this.quotas = [
        ...next,
        ...this.quotas.filter((q) => !next.some((n) => n.id === q.id))
      ];
      this.changed();
    }
  }
  stats(agent: HudAgentId, now = this.now()) {
    const events = [...this.events.values()].filter(
      (e) => e.agent === agent && e.at > now - DAY && e.at <= now
    );
    const tokens = zero();
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      at: now - DAY + i * 3_600_000,
      total: 0
    }));
    let recent = 0,
      updatedAt: number | null = null;
    for (const event of events) {
      for (const key of Object.keys(tokens) as (keyof HudTokenTotals)[])
        tokens[key] += event[key];
      if (event.at > now - 300_000) recent += event.total;
      updatedAt = Math.max(updatedAt ?? 0, event.at);
      const index = Math.min(
        23,
        Math.floor((event.at - (now - DAY)) / 3_600_000)
      );
      buckets[index].total += event.total;
    }
    if (agent === 'codex')
      for (const quota of this.quotas)
        updatedAt = Math.max(updatedAt ?? 0, quota.updatedAt);
    return {
      tokens,
      buckets,
      tokensPerMinute: events.length ? recent / 5 : null,
      updatedAt,
      coverageSince: Math.max(now - DAY, this.startedAt),
      usageAvailable: events.length > 0,
      quotas:
        agent === 'codex'
          ? this.quotas.map(({ previous: _previous, ...q }) => ({
              ...q,
              usedPerHour:
                now - q.updatedAt > 15 * 60_000 ||
                (q.resetsAt !== null && q.resetsAt <= now)
                  ? null
                  : q.usedPerHour
            }))
          : []
    };
  }
  private changed(): void {
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 1000);
  }
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const now = this.now();
    for (const [id, e] of this.events)
      if (e.at < now - DAY * 2) this.events.delete(id);
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(
        this.path + '.tmp',
        JSON.stringify({
          version: 1,
          startedAt: this.startedAt,
          events: [...this.events.values()],
          quotas: this.quotas
        })
      );
      renameSync(this.path + '.tmp', this.path);
    } catch (error) {
      console.warn(
        '[HUD] Statistics could not be saved:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
let ledger: HudUsageLedger | undefined;
/** Opens the shared ledger in the application data directory. */
export function initHudUsage(path: string): HudUsageLedger {
  return (ledger ??= new HudUsageLedger(path));
}
/** Replaces stream observations with the same provider request identity. */
export function recordHudUsage(
  agent: HudAgentId,
  id: string,
  raw: Record<string, unknown>,
  anthropic = false
): void {
  ledger?.record(agent, id, Date.now(), normalizeTokens(raw, anthropic));
}
/** Merges local and live Codex usage by cumulative counters. */
export function recordCodexUsage(
  session: string,
  usage: Record<string, unknown>,
  at: number
): void {
  ledger?.codex(session, usage, at);
}
/** Accepts quota samples explicitly returned by the account service. */
export function recordCodexLimits(value: Record<string, unknown>): void {
  ledger?.rateLimits(value);
}
