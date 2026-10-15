/*
 * FusionIsland - A private Windows companion for local coding agents.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 * Copyright (C) 2026 FusionIsland contributors
 *
 * Licensed under GPL-3.0 with eIsland's additional terms. See LICENSE.
 */

/**
 * @file FusionIslandChat.tsx
 * @description Codex-first conversation workspace with project and approval controls.
 * @author 鸡哥
 */

import { FusionChat } from './FusionChat';
import type { JSX } from 'react';
/** Renders the full shared conversation in the standalone workbench. */
export function FusionIslandChat(): JSX.Element { return <FusionChat />; }
