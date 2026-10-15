/* FloatIsland - https://github.com/JNTMTMTM/eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file brand.ts @description Shared public brand with stable private identity. @author 鸡哥 */
import brand from '../../resources/brand.json';
export const BRAND = brand;
/** Returns the public name without changing persistence keys. @param language - Interface locale. @returns Localized name. */
export function brandName(language: string): string { return language.startsWith('zh') ? BRAND.chineseName : BRAND.englishName; }
