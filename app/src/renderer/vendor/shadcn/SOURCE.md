# shadcn/ui desktop adaptation
Source: https://github.com/shadcn-ui/ui/tree/6ea090075cd537d3b792c6c1a625e2448b6ede26
Commit: `6ea090075cd537d3b792c6c1a625e2448b6ede26`; MIT license retained in LICENSE.
Sidebar.tsx adapts SidebarHeader, SidebarMenu and SidebarMenuButton structure, data attributes and active/disabled states from the recorded upstream sidebar source.
Changes: local graphite CSS, native button/title accessibility, retained app state, no Slot/asChild, cookie, mobile Sheet, viewport filler or Ctrl+B shortcut. Window positioning remains Electron-owned. No Seelen UI or PowerToys source is copied.
