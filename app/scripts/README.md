# 工程脚本

在 `app` 目录执行脚本。环境、固定上游输入与完整命令见 [构建说明](../../docs/BUILD.md)。

| 用途 | 脚本 |
| --- | --- |
| 构建与打包 | `release-workflow.cjs`、`package-fusion.cjs`、`fusion-before-build.cjs` |
| 固定运行时准备 | `prepare-fusion-runtime.cjs`、`stage-product-runtime.cjs` |
| 下载引擎与音频恢复 | `prepare-download-runtime.py`、`prepare-source-assets.cjs` |
| 图标生成与音乐来源更新 | `generate-float-icons.cjs`、`update-music-resources.cjs` |
| 源码归档 | `bundle-float-source.py` |
| 类型以外的源码检查 | `check-comment-standards.ts`、`check-i18n-completeness.ts` |
| 运行时与打包验收 | `verify-*.cjs` |
| 扩展打包 | `build-extension-zip.ts` |
| 更新记录与体积统计 | `generate-changelog.ts`、`generate-incremental-release-notes.ts`、`collect-build-sizes.ts` |
| 发布上传与缓存刷新 | `upload-*.ts`、`esa/` |

资源生成脚本会更新对应资源，应在需要更新资源时单独执行。发布上传和缓存刷新脚本会操作外部服务，不属于本地检查流程。

一次性的源码改写脚本不作为构建步骤保留。测试日志、截图、临时用户配置和打包输出应放入源码仓库之外的构建目录。
