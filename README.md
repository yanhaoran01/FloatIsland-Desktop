# FloatIsland

[English](README.en.md)

FloatIsland 是 Windows 桌面的贴边工作台，将对话、实用工具、音乐、阅读和下载集中在一个可收起的窗口中。支持顶部、左侧和右侧停靠，深色与浅色主题，以及独立窗口。

[下载最新版](https://github.com/yanhaoran01/FloatIsland-Desktop/releases/latest) · [使用说明](docs/USER_GUIDE.md) · [构建与发布](docs/BUILD.md) · [更新记录](CHANGELOG.md) · [许可证](LICENSE)

## 安装

系统要求：Windows 10/11，64 位。安装包包含 Electron、OCR 模型和下载引擎，使用时无需另装 Node.js 或 Python。

| 发布文件 | 用途 |
| --- | --- |
| `FloatIsland-1.3.3-Setup.exe` | 安装版，可选择安装目录，适合日常使用 |
| `FloatIsland-1.3.3-portable.exe` | 免安装版，直接运行 |
| `FloatIsland-1.3.3-source.zip` | 对应版本的完整源码与构建资料 |
| `SHA256SUMS.txt` | 发布文件的 SHA-256 校验值 |

从 [GitHub Releases](https://github.com/yanhaoran01/FloatIsland-Desktop/releases) 下载。升级前退出正在运行的旧版本，再安装或替换程序。便携版同样使用应用配置目录，用户数据不会自动保存在 EXE 旁。卸载默认保留用户数据。

首次启动按引导完成设置，点击“开始使用”进入对话。停靠位置、快捷键、主题及角色外观均可在设置中调整。安装包未进行代码签名，Windows 可能显示未知发布者。更新检查使用本仓库的 GitHub Releases。

桌面角色保留简洁的原始眼睛造型，会平滑注视鼠标位置；点击角色可依次触发眨眼、睁眼、提示、轨道、闪光和彗星动作。任务状态会使用对应的短暂反馈，收起胶囊后仍可从屏幕边缘唤回。

## 功能

| 工作区 | 内容 |
| --- | --- |
| 对话 | 模型连接、附件、语音草稿、会话管理、停止生成 |
| 工具 | 截图与 OCR、剪贴板、收藏、计算换算、二维码、笔记待办、计时、翻译、图片、PDF、ZIP、文件互传及开发工具 |
| 音乐 | 搜歌、歌单、本地音乐、播放与歌词、音源管理 |
| 阅读 | 本地书架、文档阅读、目录、书签与选中文字翻译、搜书、书源及 OPDS |
| 下载 | 普通链接、媒体下载、BT/磁力、任务与历史 |

工具按常用、媒体、效率、文件和开发分类，搜索可匹配工具及子功能。同一工具的主要操作放在工作区内，处理结果提供适用的复制、保存或下一步入口。

默认展开尺寸为 760×560，通常最小为 560×420；实际尺寸受屏幕可用区域限制。切换页面保留已访问工作区的输入、结果与滚动位置，手动窗口尺寸独立保存。窄窗口会重排工具栏、表单和结果区域。设置中的“减少动画”适用于偏好简短过渡的用户。

## 文件与在线服务

音乐与阅读的专用导入引用原文件，支持文件选择、文件夹扫描和拖入。收藏库具有独立的移动入库与撤销规则，操作前请留意所在工作区。

截图 OCR 默认在本机使用随附的中文、英文模型，无需账号。文本翻译会将文本提交给所选服务；云端图片排版翻译单独配置。

模型、在线音源、书源及网站下载需要网络和相应服务。搜索、播放、歌单与下载是分别提供的能力，以所选来源的状态为准。第三方音源脚本需自行导入。请求无损或 Hi-Res 不会提升原文件的实际音质。

阅读支持 EPUB、MOBI、AZW3、FB2、CBZ、TXT、PDF、Word 和 Excel，定位方式随格式而异。加密、DRM、损坏文件及部分复杂排版可能无法正常读取。网站登录、地区限制、验证和链接有效期也会影响下载。完整操作与排错见[使用说明](docs/USER_GUIDE.md)。

## 源码与开发

```text
app/            Electron 应用、界面、服务与 Windows 插件
dsh-plugin/     配套插件
vendor/         保留来源与许可证的衍生组件源码
scripts/        原生主机构建与固定运行时准备
docs/           使用、构建与发布说明
```

开发环境为 Windows x64、Node.js 24.19 或更新版本、npm 和 Python 3；编译原生组件另需 Rust、.NET SDK、Visual Studio C++ 构建工具及 Windows SDK。依赖由锁文件固定。

```powershell
cd app
npm ci --ignore-scripts
```

新克隆还需准备固定运行时、音频资源及原生主机，然后才能完整构建或打包。具体命令见[构建与发布](docs/BUILD.md)。仓库包含应用源码、必要资源、构建脚本、锁文件和第三方许可，不包含依赖目录、编译输出、个人配置与日志。修改约定见[贡献说明](CONTRIBUTING.md)。

## 来源与许可

FloatIsland 衍生自 [eIsland](https://github.com/JNTMTMTM/eIsland) / FusionIsland，保留原作者署名：

- Copyright (C) 2026-present JNTMTMTM
- Copyright (C) 2026-present pyisland.com

本仓库沿用原项目 [LICENSE](LICENSE)，包括其原文附加条款。使用与平台限制见[上游声明](app/docs/UPSTREAM-NOTICE.md)。第三方组件适用各自许可，来源、固定版本和修改记录见 [NOTICE](NOTICE.md)、[组件清单](app/docs/THIRD_PARTY_TOOLS.md)、各 `vendor/` 目录及 `app/resources/licenses/`。
