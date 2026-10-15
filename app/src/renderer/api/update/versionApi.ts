/*
 * eIsland - A sleek, Apple Dynamic Island inspired floating widget for Windows, built with Electron.
 * https://github.com/JNTMTMTM/eIsland
 *
 * Copyright (C) 2026 JNTMTMTM
 * Copyright (C) 2026 pyisland.com
 *
 * Original author: JNTMTMTM[](https://github.com/JNTMTMTM)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

/**
 * @file versionApi.ts
 * @description 版本信息接口模块
 * @author 鸡哥
 */

import type { VersionInfo } from './types/VersionInfo';

export type { VersionInfo };

const RELEASES_API = 'https://api.github.com/repos/yanhaoran01/FloatIsland-Desktop/releases/latest';

/**
 * 获取本项目的最新正式发行版。
 * @returns 版本信息，网络不可用或尚无发行版时返回 null。
 */
export async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const response = await window.api.netFetch(RELEASES_API, { method: 'GET', timeoutMs: 5000 });
    if (!response.ok) return null;
    const release = JSON.parse(response.body) as {
      id: number; tag_name: string; body?: string; published_at: string; draft?: boolean; prerelease?: boolean;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    if (release.draft || release.prerelease || typeof release.tag_name !== 'string') return null;
    const installer = release.assets?.find(asset => /^FloatIsland-[\d.]+-Setup\.exe$/.test(asset.name));
    if (!installer) return null;
    return {
      appName: 'FloatIsland', version: release.tag_name.replace(/^v/, ''), description: release.body || '',
      downloadUrl: installer.browser_download_url, id: release.id, updatedAt: release.published_at,
    };
  } catch { return null; }
}

/**
 * 保留旧调用接口；本发行版不向上游发送下载统计。
 * @param _version - 下载的版本号。
 * @returns false，表示未上报。
 */
export async function reportUpdateDownloadCount(_version: string): Promise<boolean> {
  return false;
}
