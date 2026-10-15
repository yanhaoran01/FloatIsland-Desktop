/**
 * @file FusionResourceIcon.tsx
 * @description Reuses eIsland's provider and development-language icon catalogues in the merged workspace.
 * @author 鸡哥
 */
import type { JSX } from 'react';
import { AgentIcon, SvgIcon, resolveDevIconByFileName } from '../../utils/SvgIcon';

const PROVIDER_ICONS = {
  codex: AgentIcon.CODEX, dsh: SvgIcon.DEEPSEEK, openai: SvgIcon.AI,
  anthropic: AgentIcon.CLAUDE, ollama: SvgIcon.OLLAMA,
};

/** Shows the existing host icon for the selected provider. */
export function FusionProviderIcon({ provider }: { provider: keyof typeof PROVIDER_ICONS }): JSX.Element {
  return <img className="fusion-resource-icon no-filter" src={PROVIDER_ICONS[provider]} alt="" aria-hidden="true" />;
}

/** Resolves file icons through eIsland's original catalogue using packaged-page-relative URLs. */
export function FusionFileIcon({ name }: { name: string }): JSX.Element {
  const source = resolveDevIconByFileName(name)?.replace(/^\//, './') || SvgIcon.ATTACHMENT;
  return <img className="fusion-resource-icon no-filter" src={source} alt="" aria-hidden="true" />;
}
