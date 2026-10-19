# 构建与发布

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `app/src/main` | 窗口、文件授权、下载、阅读、音乐及服务协调 |
| `app/src/preload` | 带类型的受限 IPC 接口 |
| `app/src/renderer` | React 工作区、工具、主题和角色 |
| `app/resources` | 图标、OCR 模型、运行资源清单及许可证 |
| `app/plugins`、`app/native` | Windows 插件和原生主机源码 |
| `app/vendor`、`vendor` | 固定版本的第三方及衍生源码 |
| `app/i18n` | 简体中文、英文翻译 |
| `dsh-plugin` | 配套插件 |
| `scripts` | 固定上游准备、Rust 主机构建 |

## 环境

使用 Windows 10/11 x64、Node.js 24.19 或更新版本、npm、Python 3 和 7-Zip。Electron 与 JavaScript 依赖由 `app/package-lock.json` 固定。

编译 Rust 主机需安装 Rust stable 的 `x86_64-pc-windows-msvc` 工具链、Visual Studio C++ 构建工具与 Windows SDK。完整重编 Windows 插件还需对应工程声明的 .NET SDK，当前插件包含 .NET 10 工程。`npm ci` 不会自动生成这些插件的全部 DLL。

1.3.5 的 Windows 插件运行时固定来自 eIsland v26.7.4。准备脚本核对安装包 SHA-256，运行时脚本核对版本与 JavaScript 绑定。固定运行时适合构建未修改的上游插件；修改插件源码后应重编对应组件并更新固定来源及绑定校验。

## 获取源码与依赖

```powershell
git clone https://github.com/yanhaoran01/FloatIsland-Desktop.git
cd FloatIsland-Desktop
git checkout v1.3.5
cd app
npm ci --ignore-scripts
node node_modules/electron/install.js
```

也可解压 Release 的 `FloatIsland-1.3.5-source.zip`。当前源码目录保留应用实现、必要资源、构建脚本、锁文件及许可证，已发布版本的源码包以对应标签为准。

## 准备固定资源

以下命令先在仓库根目录执行。默认缓存位于 `%LOCALAPPDATA%/FloatIsland/build-cache`，不会把上游安装包和解压目录放进源码树。

```powershell
./scripts/prepare-upstream-runtime.ps1
$env:FUSION_UPSTREAM_RESOURCES = Join-Path $env:LOCALAPPDATA 'FloatIsland/build-cache/eIsland-26.7.4/application/resources'
```

脚本下载并解压 [eIsland v26.7.4 安装包](https://github.com/JNTMTMTM/eIsland/releases/tag/v26.7.4)。已有安装包时可传入 `-InstallerPath 'D:/Downloads/eIsland-26.7.4-Setup.exe'`；使用 `-CacheDirectory` 可更改缓存目录，此时同步调整上面的资源路径。

在 `app` 目录恢复下载引擎与音频：

```powershell
cd app
python scripts/prepare-download-runtime.py
node scripts/prepare-source-assets.cjs (Join-Path $env:FUSION_UPSTREAM_RESOURCES 'app.asar')
```

下载引擎依据 `resources/download-runtime/manifest.json` 获取并核对 SHA-256。音频逐文件核对 `resources/source-assets.json`；OCR 模型随源码提供。运行安装包时无需再次下载这些基础资源。

返回仓库根目录，构建三个 Rust 主机：

```powershell
cd ..
./scripts/build-echoisland-sidecar.ps1
```

脚本生成 `app/resources/echoisland/desktop-host.exe`、`fusion-host.exe` 和 `fusion-hook.exe`。Rust 编译缓存默认放在系统临时目录，可通过 `-CargoTargetDir` 指定。

Apple Music 的逐字歌词需要自行提供有效的开发者令牌。可参考 `app/.env.example` 设置构建变量；发行包不附带此令牌，其他歌词来源仍可使用。`VITE_` 变量会写入客户端，请勿填入私人凭据。

## 开发与构建

在 `app` 目录执行：

```powershell
cd app
npx tsc --noEmit -p tsconfig.node.json
npx tsc --noEmit -p tsconfig.web.json
npm run i18n:check
npm run build
```

原生插件全部在本机编译完成后，可使用 `npm run dev` 启动开发模式；插件构建命令为 `npm run plugins:build`。使用固定上游运行时进行完整启动时，采用下一节的 `stage` 与 `launch`。

## 构建安装版与便携版

在 `app` 目录设置专属构建目录，避免与源码及最终交付文件混放：

```powershell
$buildRoot = Join-Path $env:LOCALAPPDATA 'FloatIsland/build-cache/1.3.5'
$env:FUSION_BUILD_DIR = Join-Path $buildRoot 'runtime'
$env:FUSION_OUTPUT_DIR = Join-Path $buildRoot 'output'

node scripts/release-workflow.cjs checks
node scripts/release-workflow.cjs build
node scripts/release-workflow.cjs stage
node scripts/release-workflow.cjs verify
node scripts/release-workflow.cjs package
```

这些命令分别完成源码检查、生产编译、固定运行时准备、输出核对及双格式打包。`FUSION_UPSTREAM_RESOURCES` 须保持上一节的设置。也可将 `FUSION_RUNTIME_SEED` 指向已有且带 `runtime-provenance.json` 的固定运行时。

`stage` 从固定来源保留 Windows 原生组件，并复制当前锁定的生产依赖和嵌套依赖。OCR worker、WASM、语言模型和媒体工具均随包提供。`verify` 核对源码与编译摘要；`package` 逐文件比较 ASAR 与编译输出，并检查原生运行时、GUI 加载和媒体资源。检查或编译后修改源码，需要重新执行对应流程。

调试完整运行时可执行：

```powershell
node scripts/release-workflow.cjs launch
```

该启动方式使用构建目录内的独立配置，启用本机调试端口。正式安装包不使用该调试配置。

最终 EXE 位于 `FUSION_OUTPUT_DIR`，名称为 `FloatIsland-1.3.5-Setup.exe` 和 `FloatIsland-1.3.5-portable.exe`。两者来自同一份编译输出。当前配置没有代码签名；如需签名，按 electron-builder 的证书配置设置发布环境。

## GitHub Release

提交最终源码后，在仓库根目录导出源码包。输出目录应位于源码仓库之外：

```powershell
$releaseDir = 'D:/FloatIsland-release/1.3.5'
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
python app/scripts/bundle-float-source.py (Join-Path $releaseDir 'FloatIsland-1.3.5-source.zip')
Copy-Item (Join-Path $env:FUSION_OUTPUT_DIR 'FloatIsland-1.3.5-Setup.exe') $releaseDir
Copy-Item (Join-Path $env:FUSION_OUTPUT_DIR 'FloatIsland-1.3.5-portable.exe') $releaseDir
Copy-Item (Join-Path $env:FUSION_OUTPUT_DIR 'latest.yml') $releaseDir
Copy-Item (Join-Path $env:FUSION_OUTPUT_DIR 'FloatIsland-1.3.5-Setup.exe.blockmap') $releaseDir

Get-ChildItem $releaseDir -File | Where-Object Name -ne 'SHA256SUMS.txt' | Sort-Object Name |
  ForEach-Object { '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name } |
  Set-Content (Join-Path $releaseDir 'SHA256SUMS.txt') -Encoding utf8NoBOM
```

源码导出脚本要求工作区干净，使用 Git 归档生成 ZIP。发布目录包含两个 EXE、源码 ZIP、`SHA256SUMS.txt`、`latest.yml` 及安装包的 `.blockmap`；构建缓存、日志、截图、覆盖率及检查 JSON 留在本机构建目录。

推送源码后，将 `v1.3.5` 标签指向该提交，并在 GitHub Release 上传发行文件。Release 说明包含版本变化、系统要求、安装方式及实际限制，可使用 GitHub CLI：

```powershell
git push origin main
gh release create v1.3.5 --repo yanhaoran01/FloatIsland-Desktop --target (git rev-parse HEAD) --title 'FloatIsland 1.3.5' --notes-file 'D:/FloatIsland-release/notes.md' "$releaseDir/*"
```

再次发布时使用新版本号，同步 `app/package.json`、锁文件、更新记录及归档文件名。保留已发布版本和对应源码标签。
