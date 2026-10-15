/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file avatarConfig.ts @description Versioned offline character preferences shared by both processes. @author 鸡哥 */
export const AVATAR_SHAPES = ['cercle','galet','squircle','capsule','triangle','hexagone','nuage','goutte'] as const;
export const AVATAR_EXPRESSIONS = ['neutre','attentif','surpris','excite','heureux','hilare','colere','triste','effraye','mefiant','confus','curieux','fier','timide','blase','somnolent'] as const;
export const AVATAR_COLORS = ['encre','brun','rouge','orange','ambre','vert','turquoise','bleu','violet','rose','gris','creme'] as const;
export interface AvatarConfig { version: 2; shape: typeof AVATAR_SHAPES[number]; expression: typeof AVATAR_EXPRESSIONS[number]; color: typeof AVATAR_COLORS[number]; }
export const DEFAULT_AVATAR: AvatarConfig = {version:2,shape:'cercle',expression:'neutre',color:'creme'};
/** Validates stored configuration without changing unrelated settings. */
export function validAvatar(value: unknown): value is AvatarConfig {
  if (!value || typeof value !== 'object') return false;
  const item=value as Partial<AvatarConfig>;
  return item.version===2 && AVATAR_SHAPES.some(id=>id===item.shape) && AVATAR_EXPRESSIONS.some(id=>id===item.expression) && AVATAR_COLORS.some(id=>id===item.color);
}
/** Returns a fresh default when a saved version or identifier is unsupported. */
export function normalizeAvatar(value: unknown): AvatarConfig {
  if(validAvatar(value))return {...value};
  if(value&&typeof value==='object'&&'version' in value&&value.version===1&&'shape' in value&&'expression' in value){
    const shape=AVATAR_SHAPES.find(id=>id===value.shape),expression=AVATAR_EXPRESSIONS.find(id=>id===value.expression);
    if(shape&&expression)return {...DEFAULT_AVATAR,shape,expression};
  }
  return {...DEFAULT_AVATAR};
}
