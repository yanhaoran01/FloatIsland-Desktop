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
 * @file electron.vite.config.ts
 * @description Electron + Vite 构建配置，定义 main、preload、renderer 的打包入口与输出目录
 * @author 鸡哥
 */

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: mode === 'development' ? 'inline' : false,
      outDir: 'out/main',
      rollupOptions: {
        output: { chunkFileNames: '[name]-[hash].js' },
        input: {
          index: resolve(__dirname, 'src/main/bootstrap.ts'),
          smtcWorker: resolve(__dirname, 'src/main/smtcWorker.ts'),
          windowCaptureWorker: resolve(__dirname, 'src/main/system/windowCaptureWorker.ts'),
          scrollWorker: resolve(__dirname, 'src/main/system/scrollWorker.ts'),
          bookSourceWorker: resolve(__dirname,'src/main/system/bookSourceWorker.ts'),
          productWorker: resolve(__dirname, 'src/main/system/productWorker.ts'),
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: mode === 'development' ? 'inline' : false,
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          productAux: resolve(__dirname, 'src/preload/productAux.ts'),
          pixelPicker: resolve(__dirname, 'src/preload/pixelPicker.ts'),
          musicPlugin: resolve(__dirname, 'src/preload/musicPlugin.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    worker: { format: 'es' },
    publicDir: resolve(__dirname, 'src/renderer/public'),
    build: {
      sourcemap: mode === 'development' ? 'inline' : false,
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          DocumentReader: resolve(__dirname, 'src/renderer/DocumentReader.html'),
          ProductRecordHost: resolve(__dirname, 'src/renderer/ProductRecordHost.html'),
          MusicPluginHost: resolve(__dirname, 'src/renderer/MusicPluginHost.html'),
          FusionVideo: resolve(__dirname, 'src/renderer/FusionVideo.html'),
          DynamicIslandIndex: resolve(__dirname, 'src/renderer/DynamicIslandIndex.html'),
          DynamicIslandStandalone: resolve(__dirname, 'src/renderer/DynamicIslandStandalone.html'),
          DynamicIslandAibackground: resolve(__dirname, 'src/renderer/DynamicIslandAibackground.html'),
          DynamicIslandSplash: resolve(__dirname, 'src/renderer/DynamicIslandSplash.html'),
          DynamicIslandGuide: resolve(__dirname, 'src/renderer/DynamicIslandGuide.html')
        }
      },
    },
    plugins: [react(), tailwindcss()]
  }
}));
