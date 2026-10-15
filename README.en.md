# FloatIsland

[简体中文](README.md)

FloatIsland is a dockable desktop workspace for Windows. It brings chat, utility tools, music, reading and downloads into a window that collapses to the top, left or right edge of the screen.

[Download](https://github.com/yanhaoran01/FloatIsland-Desktop/releases/latest) · [User guide](docs/USER_GUIDE.md) · [Build instructions](docs/BUILD.md) · [Changelog](CHANGELOG.md)

## Install

Windows 10 or 11, x64. Download `FloatIsland-1.3.3-Setup.exe` for installation, or `FloatIsland-1.3.3-portable.exe` to run without installing. Node.js and Python are not required to use either package.

The portable build uses the normal application data directory. Settings are not stored beside the executable. Close the previous version before upgrading; uninstalling keeps user data by default. The executables are unsigned, so Windows may show an unknown-publisher prompt.

## Features

| Workspace | Contents |
| --- | --- |
| Chat | Model connections, attachments, voice drafts and session management |
| Tools | Screenshots, local Chinese/English OCR, clipboard, notes, timers, translation, QR codes, image/PDF/ZIP tools and LAN file transfer |
| Music | Search, playlists, local files, playback, lyrics and source management |
| Reading | Local bookshelf, EPUB/MOBI/FB2/CBZ/TXT/PDF/Word/Excel readers, bookmarks, book sources and OPDS |
| Downloads | Direct links, website downloads, media links, BitTorrent and magnet links |

The interface supports Chinese and English, dark and light themes, separate windows, keyboard shortcuts and reduced motion. Local Agent cards distinguish detected installations, active sessions and restored history. Window switching depends on the Agent and its available window information.

## Requirements and limitations

OCR models and download tools are bundled. Model APIs, translation services, online music, book sources and website downloads require their respective connections and permissions. Voice input can reuse a locally installed DeepSeek Harness recognizer and prepared SenseVoice models; speech models are not included.

Music-source scripts are imported by the user. Search, playback and download support depend on the source. DRM, login requirements, regional restrictions and expired links can prevent access. Apple Music authorization tokens are not included in the release.

## Build

Use Windows x64, Node.js 24.19 or newer, npm, Python 3 and 7-Zip. Native hosts also require Rust and the Visual Studio C++ build tools; rebuilding Windows plugins requires their declared .NET SDKs.

Start with `npm ci --ignore-scripts` in `app/`, then follow [the build instructions](docs/BUILD.md) to prepare pinned runtime resources, restore audio and build the native hosts. The source includes implementation files, lockfiles, resource manifests and license notices. Dependencies and generated binaries are restored during the build.

## License and credits

FloatIsland is derived from [eIsland](https://github.com/JNTMTMTM/eIsland) / FusionIsland. Original attribution is retained:

- Copyright (C) 2026-present JNTMTMTM
- Copyright (C) 2026-present pyisland.com

The complete upstream [LICENSE](LICENSE), including its additional terms and Windows platform restriction, applies. See [NOTICE](NOTICE.md), [upstream notices](app/docs/UPSTREAM-NOTICE.md) and [third-party notices](app/docs/THIRD_PARTY_TOOLS.md) for component sources, licenses and modifications. No upstream project endorses this project.
