# eSearch adaptation

Version 15.6.0, commit 6f3f56241cccc8ada2c503df642566322dc67a3e. Source: https://github.com/xushengfeng/eSearch. GPL-3.0. Upstream files are preserved as text snapshots for attribution and review.

Adapted longMatch inner-strip clipping and pin opacity/minimum zoom into src/shared/esearchCore.ts; used by native pin and scroll worker. Recorder uses the upstream keycode lookup approach, restricted to combinations and function keys, in a dedicated sandboxed recording host rather than importing the DKH renderer. Capture and FFmpeg services remain the existing application services. Scroll matching replaces picture_match with a bounded worker matcher. No upstream UI is loaded online.
