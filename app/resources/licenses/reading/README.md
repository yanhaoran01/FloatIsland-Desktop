# FloatIsland local reading components

Foliate.js (MIT), commit 78914aef4466eb960965702401634c2cb348e9b1. Patched paginator: scripts disabled in book frames; zip entry/size limits. React adapter and isolated float-reader origin.

AnyReader (aooiuu and contributors, GPL-3.0), commit 582056d3abab43e32437103c254a934a5e5bbb38. Original Legado analyzer source is retained here. Adapted CSS/default, JSONPath, XPath, regex and pure JavaScript rules; replaced native Jsoup and isolated-vm with Cheerio/QuickJS. Network and Android helpers are deliberately not exposed.

Mammoth 1.13.0 (BSD-2-Clause), docx-preview 0.4.1 (Apache-2.0), SheetJS CE 0.20.3 (Apache-2.0 official vendored tarball), QuickJS-Emscripten 0.32.0 (MIT). Versions and integrity are locked in package-lock.json.

Readest is a design reference only; no Readest application code is distributed.
