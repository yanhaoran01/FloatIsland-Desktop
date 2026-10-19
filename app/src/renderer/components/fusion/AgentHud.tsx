/* FloatIsland contributors. GPL-3.0. */
/** @file AgentHud.tsx @description Quiet edge HUD, usage details and actionable session cards. @author 鸡哥 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid2X2, MessageSquare, Mic, Music2, Settings, X } from 'lucide-react';
import type {
  AgentHudSnapshot,
  HudAgent
} from '../../../preload/types/agentHud';
import type { FusionDockConfig } from '../../../preload/types/fusionWorkspace';
import useIslandStore from '../../store/slices';
import { useProductStore } from './productStore';
import { writeWorkspaceNavigation } from './workspaceNavigation';
import { useFusionPreferences } from './fusionPreferences';
import { useHudRequests } from './hudRequests';
import { HudRequestCard, openHudSession } from './HudRequestCard';
import { resolveToolTarget } from './tools/toolRegistry';
import './agentHud.css';

const empty: AgentHudSnapshot = { agents: [], completion: null, updatedAt: 0 };
const count = (n: number): string =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: n >= 10000 ? 'compact' : 'standard'
  }).format(n);
function navigate(view: 'chat' | 'tools' | 'settings', tool?: string): void {
  if (view !== 'settings') writeWorkspaceNavigation({ islandPage: view });
  useProductStore
    .getState()
    .set({ target: '', searchOpen: false, dropOpen: false });
  useIslandStore
    .getState()
    .setMaxExpandTab(
      view === 'settings' ? 'settings' : view === 'tools' ? 'toolbox' : 'aiChat'
    );
  useIslandStore.getState().setMaxExpand();
  if (view !== 'settings')
    window.dispatchEvent(
      new CustomEvent('fusion-navigate-peer', { detail: view })
    );
  if (tool) {
    const route = resolveToolTarget(tool);
    useProductStore
      .getState()
      .set({ target: route.id, tab: route.tab, nonce: Date.now() });
    writeWorkspaceNavigation({
      islandPage: tool === 'music' ? 'music' : 'tools'
    });
    window.dispatchEvent(new CustomEvent('fusion-open-tool', { detail: tool }));
  }
}
function AgentDetails({
  agent: a,
  full
}: {
  agent: HudAgent;
  full: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const time = (at: number | null) =>
    at ? new Date(at).toLocaleString() : '—';
  const largest = Math.max(1, ...a.buckets.map((b) => b.total));
  return (
    <section className="agent-hud-details">
      <header>
        <strong>{a.name}</strong>
        <span>
          {t('fusion.hud.' + a.status)}
          {a.stale ? ' · ' + t('fusion.hud.stale') : ''}
        </span>
      </header>
      {a.quotas.length ? (
        a.quotas.map((q) => (
          <div className="agent-hud-quota" key={q.id}>
            <div>
              <strong>
                {q.windowMinutes
                  ? t('fusion.hud.window', {
                      hours: count(q.windowMinutes / 60)
                    })
                  : q.label}
              </strong>
              <span>
                {t('fusion.hud.used', { percent: count(q.usedPercent) })}
              </span>
            </div>
            <progress max={100} value={q.usedPercent} />
            <small>
              {q.shared ? t('fusion.hud.shared') + ' · ' : ''}
              {t('fusion.hud.reset', { time: time(q.resetsAt) })}
            </small>
            <small>
              {t('fusion.hud.updated', { time: time(q.updatedAt) })}
              {full
                ? ' · ' +
                  t('fusion.hud.quotaRate', {
                    rate: q.usedPerHour === null ? '—' : count(q.usedPerHour)
                  })
                : ''}
            </small>
          </div>
        ))
      ) : (
        <div><p>{t('fusion.hud.noQuota')}</p><small>{t('fusion.hud.updated', {time:time(a.updatedAt)})}</small></div>
      )}
      {full && (
        <>
          <div className="agent-hud-metrics">
            <div>
              <small>{t('fusion.hud.tokens24')}</small>
              <strong>{a.usageAvailable ? count(a.tokens.total) : '—'}</strong>
            </div>
            <div>
              <small>{t('fusion.hud.tokenRate')}</small>
              <strong>
                {a.tokensPerMinute === null ? '—' : count(a.tokensPerMinute)}
              </strong>
            </div>
          </div>
          <svg
            className="agent-hud-chart"
            viewBox="0 0 360 64"
            role="img"
            aria-label={t('fusion.hud.tokens24')}
          >
            {a.buckets.map((b, i) => (
              <rect
                key={b.at}
                x={i * 15}
                y={62 - (b.total / largest) * 58}
                width="11"
                height={Math.max(1, (b.total / largest) * 58)}
                rx="2"
              >
                <title>
                  {time(b.at)} · {count(b.total)} Token
                </title>
              </rect>
            ))}
          </svg>
          <small>
            {t('fusion.hud.tokenBreakdown', {
              input: count(a.tokens.input),
              output: count(a.tokens.output),
              cached: count(a.tokens.cached),
              reasoning: count(a.tokens.reasoning)
            })}
          </small>
          <p className="agent-hud-note">
            {t('fusion.hud.coverage', { time: time(a.coverageSince) })}{' '}
            {t('fusion.hud.observedOnly')}
          </p>
          <small>{t('fusion.hud.updated', { time: time(a.updatedAt) })}</small>
          <button onClick={() => navigate('chat')}>
            {t('fusion.hud.openSessions')}
          </button>
        </>
      )}
    </section>
  );
}
/** Subscribes to existing services only; displaying the HUD never starts an agent. */
export function AgentHud({
  config,
  active
}: {
  config?: FusionDockConfig;
  active: boolean;
}): JSX.Element | null {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState(empty),
    [selected, setSelected] = useState<string | null>(null),
    [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null),
    [dismissedReply, setDismissedReply] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const requests = useHudRequests();
  const hovered = useRef(false),
    hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completionEnabled = useFusionPreferences(
    (s) => s.value.completionReminders
  );
  const simple = config?.mode === 'simple',
    display = config?.quotaDisplay ?? 'ring';
  const request = requests[Math.min(page, Math.max(0, requests.length - 1))];
  const pending = requests.length > 0;
  const completion =
    completionEnabled && snapshot.completion?.id !== dismissedReply
      ? snapshot.completion
      : null;
  const visibleRequest = request && dismissed !== request.key ? request : null;
  const agent = snapshot.agents.find((a) => a.id === selected);
  const panel = Boolean(
    visibleRequest || (!pending && completion) || (active && agent)
  );
  const requestKeys = requests.map((r) => r.key).join('|');
  const previousKeys = useRef(new Set<string>());
  useEffect(() => {
    const next = new Set(requests.map((r) => r.key));
    if ([...next].some((key) => !previousKeys.current.has(key)))
      setDismissed(null);
    previousKeys.current = next;
    setPage(0);
  }, [requestKeys]);
  useEffect(() => {
    let mounted = true;
    void window.api
      .fusionHudSnapshot()
      .then((v) => {
        if (mounted) setSnapshot(v);
      })
      .catch(() => {});
    const off = window.api.onFusionHud((v) => setSnapshot(v));
    return () => {
      mounted = false;
      off();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.fusionHudPanel = String(panel);
    void window.api.fusionHudPanel(panel);
    return () => {
      document.documentElement.dataset.fusionHudPanel = 'false';
      void window.api.fusionHudPanel(false);
    };
  }, [panel]);
  useEffect(() => {
    if (!active) {
      setSelected(null);
      setPinned(false);
    }
  }, [active]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const collapse = (): void => {
    if (pending || hovered.current) return;
    setSelected(null);
    setPinned(false);
  };
  useEffect(() => {
    if (!panel || pending || hovered.current || !config?.autoHide) return;
    const timer = setTimeout(collapse, config.delayMs);
    return () => clearTimeout(timer);
  }, [panel, pending, config?.autoHide, config?.delayMs, selected]);
  const close = (): void => {
    if (visibleRequest) setDismissed(visibleRequest.key);
    else if (completion) {
      setDismissedReply(completion.id);
      void window.api.fusionHudDismiss(completion.id);
    }
    setSelected(null);
    setPinned(false);
  };
  if ((!active && !panel) || (!simple && !panel)) return null;
  return (
    <div
      className="agent-hud"
      data-panel={panel}
      data-vertical={
        !panel && (config?.edge === 'left' || config?.edge === 'right')
      }
      onClick={(e) => e.stopPropagation()}
      onPointerEnter={() => {
        hovered.current = true;
        clearTimeout(hoverTimer.current);
      }}
      onPointerLeave={() => {
        hovered.current = false;
        clearTimeout(hoverTimer.current);
        if (!pending && (!pinned || config?.autoHide))
          hoverTimer.current = setTimeout(
            collapse,
            config?.autoHide ? config.delayMs : 600
          );
      }}
    >
      <div className="agent-hud-strip">
        <span
          className="agent-hud-grip"
          title={t('fusion.hud.drag')}
          aria-hidden="true"
        >
          ⋮
        </span>
        <div className="agent-hud-agents">
          {snapshot.agents.map((a) => {
            const used = a.quotas[0]?.usedPercent;
            return (
              <button
                key={a.id}
                className="agent-hud-agent"
                data-status={a.status}
                data-stale={a.stale}
                aria-label={a.name + ' · ' + t('fusion.hud.' + a.status)}
                title={
                  a.name +
                  ' · ' +
                  (used === undefined
                    ? '—'
                    : t('fusion.hud.used', { percent: count(used) }))
                }
                onPointerEnter={() => {
                  clearTimeout(hoverTimer.current);
                  if (!pinned && !pending)
                    hoverTimer.current = setTimeout(() => {
                      setSelected(a.id);
                      setPinned(false);
                    }, 350);
                }}
                onPointerLeave={() => clearTimeout(hoverTimer.current)}
                onFocus={() => {
                  if (!pending) setSelected(a.id);
                }}
                onClick={() => {
                  setSelected(a.id);
                  setPinned(true);
                }}
              >
                {display !== 'number' && (
                  <svg viewBox="0 0 32 32" aria-hidden="true">
                    <circle
                      className="agent-hud-ring-track"
                      cx="16"
                      cy="16"
                      r="13"
                    />
                    {used !== undefined && (
                      <circle
                        className="agent-hud-ring-fill"
                        cx="16"
                        cy="16"
                        r="13"
                        strokeDasharray={81.681}
                        strokeDashoffset={81.681 * (1 - used / 100)}
                      />
                    )}
                  </svg>
                )}
                <span>
                  {used === undefined
                    ? '—'
                    : display === 'ring'
                      ? a.name.slice(0, 1)
                      : Math.round(used) + '%'}
                </span>
                <i />
              </button>
            );
          })}
          {!snapshot.agents.length && (
            <button
              className="agent-hud-empty"
              onClick={() => navigate('settings')}
            >
              {t('fusion.hud.configure')}
            </button>
          )}
        </div>
        <div className="agent-hud-actions">
          {pending && (
            <button
              className="agent-hud-pending"
              onClick={() => {
                setDismissed(null);
                setSelected(null);
              }}
              aria-label={t('fusion.compact.pending', {
                count: requests.length
              })}
            >
              {requests.length}
            </button>
          )}
          <button
            title={t('fusion.navigation.aiChat')}
            aria-label={t('fusion.navigation.aiChat')}
            onClick={() => navigate('chat')}
          >
            <MessageSquare size={16} />
          </button>
          <button
            title={t('fusion.workspace.pages.music')}
            aria-label={t('fusion.workspace.pages.music')}
            onClick={() => navigate('tools', 'music')}
          >
            <Music2 size={16} />
          </button>
          <button
            title={t('fusion.hud.record')}
            aria-label={t('fusion.hud.record')}
            onClick={() => navigate('tools', 'recording')}
          >
            <Mic size={16} />
          </button>
          <button
            title={t('fusion.navigation.toolbox')}
            aria-label={t('fusion.navigation.toolbox')}
            onClick={() => navigate('tools')}
          >
            <Grid2X2 size={16} />
          </button>
          {!panel && (
            <button
              title={t('fusion.navigation.settings')}
              aria-label={t('fusion.navigation.settings')}
              onClick={() => navigate('settings')}
            >
              <Settings size={15} />
            </button>
          )}
          {panel && (
            <button
              title={t('fusion.product.close')}
              aria-label={t('fusion.product.close')}
              onClick={close}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      {panel && (
        <div className="agent-hud-scroll" data-no-drag>
          {visibleRequest ? (
            <>
              <header className="agent-hud-card-heading">
                <strong>{t('fusion.hud.approval')}</strong>
                <div>
                  {requests.length > 1 && (
                    <>
                      <button
                        disabled={page <= 0}
                        onClick={() => {
                          setPage(page - 1);
                          setDismissed(null);
                        }}
                      >
                        ‹
                      </button>
                      <span>
                        {Math.min(page + 1, requests.length)} /{' '}
                        {requests.length}
                      </span>
                      <button
                        disabled={page >= requests.length - 1}
                        onClick={() => {
                          setPage(page + 1);
                          setDismissed(null);
                        }}
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              </header>
              <HudRequestCard
                key={visibleRequest.key}
                request={visibleRequest}
              />
            </>
          ) : !pending && completion ? (
            <section className="agent-hud-reply">
              <header>
                <strong>
                  {snapshot.agents.find((a) => a.id === completion.agent)
                    ?.name ?? completion.agent}
                </strong>
                <small>{new Date(completion.at).toLocaleTimeString()}</small>
              </header>
              <div>{completion.text}</div>
              <button
                onClick={() => {
                  const [source, ...id] = completion.sessionKey.split(':');
                  openHudSession(source, id.join(':'));
                }}
              >
                {t('fusion.hud.openSession')}
              </button>
            </section>
          ) : agent ? (
            <AgentDetails agent={agent} full={pinned} />
          ) : null}
        </div>
      )}
    </div>
  );
}
