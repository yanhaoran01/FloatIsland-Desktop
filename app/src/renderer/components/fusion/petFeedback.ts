/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file petFeedback.ts @description 离线分析完成回复，排除代码与引用并选择克制的角色反馈。 @author 鸡哥 */
export type ContentReaction = 'idle' | 'warning' | 'curious' | 'thanks' | 'surprised';
/**
 * 根据普通文本选择反馈，不把代码或引用中的措辞当作当前回复语气。
 * @param markdown - 已完成的最新回复。
 * @returns 单次动作；未命中时保持中性。
 */
export function contentReaction(markdown: string): ContentReaction {
  const text = markdown.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '')
    .replace(/^\s*>.*$/gm, '').replace(/`[^`]*`/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^ {4}.*$/gm, '').trim();
  if (/(?:请注意|请留意|需要注意|提醒[：:]|警告[：:]|注意[：:]|\b(?:warning|caution|please note)\b)/i.test(text)) return 'warning';
  if (/(?:[？?]\s*$|(?:是否|能否|要不要|你希望|你想)[^。！？\n]{0,100}[？?])/m.test(text)) return 'curious';
  if (/(?:谢谢|感谢|多谢|\b(?:thank you|thanks|appreciate it)\b)/i.test(text)) return 'thanks';
  if (/(?:太棒了|惊喜|哇[，！!]|\b(?:wow|wonderful|amazing)\b)/i.test(text)) return 'surprised';
  return 'idle';
}
