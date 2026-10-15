/*
 * Coucou source reused by FusionIsland for the user's personal desktop build.
 * https://github.com/Louis-CFM/coucou/tree/30edad4c5c0b6c3d16a2092a35cddeb9018a0016
 * Copyright (C) 2026 Louis Raillé. Source code: MIT.
 * Character, icons and sounds: see LICENSE-ASSETS.md; they are not GPL assets.
 * FusionIsland integration is part of the GPL-3.0 application.
 */

/**
 * @file layout.ts
 * @description Unmodified Coucou pet state and expression types extracted from core/layout.ts.
 * @author 鸡哥 (FusionIsland adapter); original source: Louis Raillé
 */

export type BotStateName =
  | "idle"
  | "working"
  | "thinking"
  | "searching"
  | "approval"
  | "question"
  | "error"
  | "finished"
  | "ratelimit"
  | "sleeping"
  | "dizzy";

export type BotEmoteName = "love" | "surprised" | "proud" | "wink" | "yawn" | "happy" | "annoyed";
