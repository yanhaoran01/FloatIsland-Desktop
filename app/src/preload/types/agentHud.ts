/* FloatIsland contributors. GPL-3.0. */
/** @file agentHud.ts @description Credential-free HUD contract for trusted views. @author 鸡哥 */
/** Public HUD data contains usage and session summaries, never credentials. */
export type HudAgentId =
  | 'codex'
  | 'dsh'
  | 'claude'
  | 'workbuddy'
  | 'openai'
  | 'anthropic'
  | 'ollama';
export interface HudQuota {
  id: string;
  label: string;
  usedPercent: number;
  resetsAt: number | null;
  windowMinutes: number | null;
  updatedAt: number;
  usedPerHour: number | null;
  shared: boolean;
}
export interface HudTokenTotals {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  total: number;
}
export interface HudAgent {
  capabilities: {
    quota: boolean;
    usage: boolean;
    approve: boolean;
    chat: boolean;
  };
  id: HudAgentId;
  name: string;
  status: 'idle' | 'working' | 'waiting' | 'offline' | 'error';
  sessions: number;
  quotas: HudQuota[];
  stale: boolean;
  usageAvailable: boolean;
  tokens: HudTokenTotals;
  tokensPerMinute: number | null;
  buckets: Array<{ at: number; total: number }>;
  coverageSince: number;
  updatedAt: number | null;
}
export interface HudCompletion {
  id: string;
  agent: HudAgentId;
  sessionKey: string;
  text: string;
  at: number;
}
export interface AgentHudSnapshot {
  agents: HudAgent[];
  completion: HudCompletion | null;
  updatedAt: number;
}
export interface AgentHudApi {
  fusionHudDismiss: (id: string) => Promise<void>;
  fusionHudSnapshot: () => Promise<AgentHudSnapshot>;
  onFusionHud: (callback: (snapshot: AgentHudSnapshot) => void) => () => void;
  fusionHudPanel: (open: boolean) => Promise<void>;
}
