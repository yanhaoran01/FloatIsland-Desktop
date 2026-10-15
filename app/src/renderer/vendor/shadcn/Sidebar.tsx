/* Derived from shadcn/ui, MIT; upstream copyright and license in LICENSE. */
/** @file Sidebar.tsx @description Desktop adaptation of pinned sidebar primitives; see SOURCE.md. @author 鸡哥 */
import type {ComponentProps} from 'react';
/** Groups the companion at the head of the rail. @param props - Header attributes. @returns Header. */
export function SidebarHeader({className = '', ...props}: ComponentProps<'div'>) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={'float-sidebar-header ' + className} {...props}/>;
}
/** Holds compact commands. @param props - Menu attributes. @returns Menu. */
export function SidebarMenu({className = '', ...props}: ComponentProps<'ul'>) {
  return <ul data-slot="sidebar-menu" data-sidebar="menu" className={'float-sidebar-menu ' + className} {...props}/>;
}
/** Uses upstream active state and icon-button structure. @param props - Native button attributes. @returns Button. */
export function SidebarMenuButton({className = '', isActive = false, ...props}: ComponentProps<'button'> & {isActive?: boolean}) {
  return <button type="button" data-slot="sidebar-menu-button" data-sidebar="menu-button" data-active={isActive} className={'float-sidebar-button ' + className} {...props}/>;
}
