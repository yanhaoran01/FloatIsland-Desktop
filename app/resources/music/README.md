# Bundled music adapters and interface sources

Listen 1 v2.33.0, commit `3f24efa045125875a609dcb0f3f3f0be4edb8b37`:
https://github.com/listen1/listen1_chrome_extension/tree/3f24efa045125875a609dcb0f3f3f0be4edb8b37

The original `js/provider/{netease,qq,migu}.js` and MIT license are included unchanged. FloatIsland executes only these fixed modules through its TypeScript adapter in `src/main/music/fusionMusicProviders.ts`. Changes live outside the vendored originals: Electron HTTP and cancellation compatibility, anonymous requests, bounded official endpoints, error propagation, QQ quality fallback, trial restriction checks and real metadata probing. The Migu placeholder catalog total is replaced by observed page availability. No browser cookies, user source scripts or account escalation are supported.

YesPlayMusic v0.4.10, commit `2c4aab49f1074104b396fb04cdae071bda68d40d`:
https://github.com/qier222/YesPlayMusic/tree/2c4aab49f1074104b396fb04cdae071bda68d40d

Original `src/components/Player.vue`, `src/components/TrackListItem.vue`, `src/views/lyrics.vue`, and MIT license are retained. The cover/title/artist row, trailing actions, retained bottom player and two-column album/lyrics arrangement are adapted in `MusicTool.tsx` and `musicTool.css`. Dimensions, typography, graphite colors, accessibility and the narrow layout are adapted for the existing React workspace. Original Vue files are reference/source attribution only, not loaded at runtime. No second application, Vue runtime, branding, icons or account integration is bundled.

`manifest.json` records SHA256 of every included upstream file. Both authors' MIT license texts are retained next to their sources. FloatIsland additions retain the application's GPL-3.0 license. Node-forge 1.4.0 is locked in package-lock.json and distributed with its original license.
