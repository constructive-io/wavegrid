'use client';

import * as React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppBar, createAppLink, type AppBarProps, type AppBreadcrumbItem, type AppLinkRenderer } from '@/components/ui/app-bar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	useSidebar,
} from '@/components/ui/sidebar';

type AppIcon = React.ComponentType<{
	className?: string;
	'aria-hidden'?: boolean | 'true' | 'false';
}>;

interface AppNavigationChild {
	id: string;
	label: React.ReactNode;
	href: string;
	isActive?: boolean;
	disabled?: boolean;
}

interface AppNavigationItem extends AppNavigationChild {
	icon?: AppIcon;
	badge?: React.ReactNode;
	defaultOpen?: boolean;
	toggleLabel?: string;
	children?: readonly AppNavigationChild[];
}

interface AppNavigationGroup {
	id: string;
	label?: React.ReactNode;
	placement?: 'main' | 'footer';
	items: readonly AppNavigationItem[];
}

interface AppShellBrand {
	name: React.ReactNode;
	description?: React.ReactNode;
	href?: string;
	logo?: React.ReactNode;
}

interface AppAccountActionBase {
	id: string;
	label: React.ReactNode;
	icon?: AppIcon;
	disabled?: boolean;
	variant?: 'default' | 'destructive';
}

type AppAccountAction = AppAccountActionBase &
	(
		| {
				href: string;
				onSelect?: never;
		  }
		| {
				href?: never;
				onSelect: () => void;
		  }
	);

interface AppAccountActionGroup {
	id: string;
	label?: React.ReactNode;
	actions: readonly AppAccountAction[];
}

interface AppAccount {
	name: string;
	secondaryLabel?: string;
	avatarUrl?: string;
	avatarAlt?: string;
	fallback?: string;
	actionGroups?: readonly AppAccountActionGroup[];
}

type SidebarProps = React.ComponentProps<typeof Sidebar>;
type AppShellRootProps = useRender.ComponentProps<'div'> & React.ComponentProps<'div'>;

type AppShellProps = Omit<AppShellRootProps, 'children'> & {
	children: React.ReactNode;
	navigation: readonly AppNavigationGroup[];
	brand?: AppShellBrand;
	account?: AppAccount;
	breadcrumbs?: readonly AppBreadcrumbItem[];
	renderLink?: AppLinkRenderer;
	barLeading?: React.ReactNode;
	barSearch?: React.ReactNode;
	barActions?: React.ReactNode;
	barProps?: Omit<AppBarProps, 'breadcrumbs' | 'renderLink' | 'leading' | 'search' | 'actions'>;
	/**
	 * Where the app bar sits relative to the sidebar.
	 * - `top` (default): full-width sticky bar above the sidebar + content row
	 * - `content`: bar only over the main column (manager-panel composition)
	 */
	barPlacement?: 'top' | 'content';
	headerHeight?: string;
	/** CSS length for the expanded desktop sidebar (default upstream token). */
	sidebarWidth?: string;
	sidebarProps?: Omit<SidebarProps, 'children'>;
	/** Rendered in the sidebar header under the brand (e.g. a workspace switcher). */
	sidebarHeader?: React.ReactNode;
	sidebarFooter?: React.ReactNode;
	/** Optional sticky footer below main content (e.g. mobile feature tabs). */
	contentFooter?: React.ReactNode;
	defaultSidebarOpen?: boolean;
	sidebarOpen?: boolean;
	onSidebarOpenChange?: (open: boolean) => void;
	contentClassName?: string;
	contentProps?: Omit<React.ComponentProps<'main'>, 'children' | 'className'>;
};

function initials(name: string) {
	const parts = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2);
	return parts.map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function navigationLink(
	renderLink: AppLinkRenderer | undefined,
	item: AppNavigationChild,
	children: React.ReactNode,
	onAcceptedNavigation?: () => void,
) {
	return createAppLink(renderLink, {
		href: item.href,
		children,
		'aria-current': item.isActive ? 'page' : undefined,
		'aria-disabled': item.disabled || undefined,
		tabIndex: item.disabled ? -1 : undefined,
		onClick: (event) => {
			if (item.disabled) {
				event.preventDefault();
				return;
			}
			if (
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey ||
				(event.currentTarget.target && event.currentTarget.target !== '_self')
			) return;
			onAcceptedNavigation?.();
		},
	});
}

function NavigationGroup({ group, renderLink }: { group: AppNavigationGroup; renderLink?: AppLinkRenderer }) {
	const { isMobile, setOpenMobile } = useSidebar();
	const closeMobileNavigation = React.useCallback(() => {
		if (isMobile) setOpenMobile(false);
	}, [isMobile, setOpenMobile]);

	return (
		<SidebarGroup>
			{group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item) => {
						const Icon = item.icon;
						const itemContent = (
							<>
								{Icon && <Icon aria-hidden='true' />}
								<span>{item.label}</span>
							</>
						);

						if (!item.children?.length) {
							return (
								<SidebarMenuItem key={item.id}>
									<SidebarMenuButton
										isActive={item.isActive}
										tooltip={typeof item.label === 'string' ? item.label : undefined}
										render={navigationLink(renderLink, item, itemContent, closeMobileNavigation)}
									/>
									{item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
								</SidebarMenuItem>
							);
						}

						const hasActiveChild = item.children.some((child) => child.isActive);
						return (
							<Collapsible
								key={item.id}
								defaultOpen={item.defaultOpen ?? item.isActive ?? hasActiveChild}
								render={<SidebarMenuItem />}
							>
								<SidebarMenuButton
									isActive={item.isActive}
									tooltip={typeof item.label === 'string' ? item.label : undefined}
									render={navigationLink(renderLink, item, itemContent, closeMobileNavigation)}
								/>
								<SidebarMenuAction
									render={
										<CollapsibleTrigger
											aria-label={
												item.toggleLabel ??
												(typeof item.label === 'string' ? `Toggle ${item.label}` : 'Toggle navigation group')
											}
										/>
									}
									className='aria-expanded:rotate-90'
								>
									<ChevronRightIcon />
								</SidebarMenuAction>
								<CollapsibleContent innerClassName='py-0'>
									<SidebarMenuSub>
										{item.children.map((child) => (
										<SidebarMenuSubItem key={child.id}>
											<SidebarMenuSubButton
												isActive={child.isActive}
												render={navigationLink(
													renderLink,
													child,
													child.label,
													closeMobileNavigation,
												)}
											/>
											</SidebarMenuSubItem>
										))}
									</SidebarMenuSub>
								</CollapsibleContent>
							</Collapsible>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function AccountMenu({ account, renderLink }: { account: AppAccount; renderLink?: AppLinkRenderer }) {
	const { isMobile } = useSidebar();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size='lg'
								className='aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground'
							/>
						}
					>
						<Avatar>
							{account.avatarUrl && <AvatarImage src={account.avatarUrl} alt={account.avatarAlt ?? account.name} />}
							<AvatarFallback>{account.fallback ?? initials(account.name)}</AvatarFallback>
						</Avatar>
						<div className='grid min-w-0 flex-1 text-left text-sm leading-tight'>
							<span className='truncate font-medium' title={account.name}>{account.name}</span>
							{account.secondaryLabel && (
								<span className='truncate text-xs' title={account.secondaryLabel}>{account.secondaryLabel}</span>
							)}
						</div>
						<ChevronsUpDownIcon className='ml-auto' />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className='min-w-56 rounded-lg'
						side={isMobile ? 'bottom' : 'right'}
						align='end'
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className='p-0 font-normal'>
								<div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
									<Avatar>
										{account.avatarUrl && (
											<AvatarImage src={account.avatarUrl} alt={account.avatarAlt ?? account.name} />
										)}
										<AvatarFallback>{account.fallback ?? initials(account.name)}</AvatarFallback>
									</Avatar>
									<div className='grid min-w-0 flex-1 text-left text-sm leading-tight'>
										<span className='truncate font-medium' title={account.name}>{account.name}</span>
										{account.secondaryLabel && (
											<span className='truncate text-xs' title={account.secondaryLabel}>{account.secondaryLabel}</span>
										)}
									</div>
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						{account.actionGroups?.map((group) => (
							<React.Fragment key={group.id}>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									{group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
									{group.actions.map((action) => {
										const Icon = action.icon;
										const actionContent = (
											<>
												{Icon && <Icon aria-hidden='true' />}
												<span>{action.label}</span>
											</>
										);

										if (action.href) {
											return (
												<DropdownMenuItem
													key={action.id}
													disabled={action.disabled}
													variant={action.variant}
													render={createAppLink(renderLink, {
														href: action.href,
														children: actionContent,
													})}
												/>
											);
										}

										return (
											<DropdownMenuItem
												key={action.id}
												disabled={action.disabled}
												variant={action.variant}
												onClick={action.onSelect}
											>
												{actionContent}
											</DropdownMenuItem>
										);
									})}
								</DropdownMenuGroup>
							</React.Fragment>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

function Brand({ brand, renderLink }: { brand: AppShellBrand; renderLink?: AppLinkRenderer }) {
	const content = (
		<>
			{/* Collapsed, the button keeps its 8px padding but the tile is the full
			    32px rail width, so it hangs off to the right; pulling it back by the
			    padding puts it on the same centre line as the nav icons. */}
			{brand.logo && (
				<div className='bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg shadow-xs group-data-[collapsible=icon]:-ml-2'>
					{brand.logo}
				</div>
			)}
			{/* Collapsed to the icon rail there is only room for the logo tile; leaving
			    the text in the flex row pushes the tile off the rail's centre line. */}
			<div className='grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
				<span className='truncate font-medium' title={typeof brand.name === 'string' ? brand.name : undefined}>
					{brand.name}
				</span>
				{brand.description && (
					<span
						className='text-muted-foreground truncate text-xs'
						title={typeof brand.description === 'string' ? brand.description : undefined}
					>
						{brand.description}
					</span>
				)}
			</div>
		</>
	);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					size='lg'
					render={
						brand.href
							? createAppLink(renderLink, { href: brand.href, children: content })
							: <div>{content}</div>
					}
				/>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

function AppShell({
	children,
	navigation,
	brand,
	account,
	breadcrumbs,
	renderLink,
	barLeading,
	barSearch,
	barActions,
	barProps,
	barPlacement = 'top',
	headerHeight = '3.5rem',
	sidebarWidth,
	sidebarProps,
	sidebarHeader,
	sidebarFooter,
	contentFooter,
	defaultSidebarOpen = true,
	sidebarOpen,
	onSidebarOpenChange,
	contentClassName,
	contentProps,
	className,
	style,
	render,
	...props
}: AppShellProps) {
	const mainGroups = navigation.filter((group) => group.placement !== 'footer');
	const footerGroups = navigation.filter((group) => group.placement === 'footer');
	const hasFooter = footerGroups.length > 0 || Boolean(account) || Boolean(sidebarFooter);
	const { className: sidebarClassName, collapsible, ...resolvedSidebarProps } = sidebarProps ?? {};
	const contentBar = barPlacement === 'content';

	const appBar = (
		<AppBar
			breadcrumbs={breadcrumbs}
			renderLink={renderLink}
			leading={barLeading}
			search={barSearch}
			actions={barActions}
			{...barProps}
		/>
	);

	const sidebar = (
		<Sidebar
			collapsible={collapsible ?? 'icon'}
			{...resolvedSidebarProps}
			className={cn(
				contentBar
					? 'h-dvh!'
					: 'top-(--app-bar-height) h-[calc(100dvh-var(--app-bar-height))]!',
				sidebarClassName,
			)}
		>
			{(brand || sidebarHeader) && (
				<SidebarHeader className={contentBar ? 'pt-5 pb-2' : undefined}>
					{brand && <Brand brand={brand} renderLink={renderLink} />}
					{sidebarHeader}
				</SidebarHeader>
			)}
			<SidebarContent className={contentBar ? 'px-1' : undefined}>
				{mainGroups.map((group) => (
					<NavigationGroup key={group.id} group={group} renderLink={renderLink} />
				))}
			</SidebarContent>
			{hasFooter && (
				<SidebarFooter className={contentBar ? 'p-0' : undefined}>
					{!contentBar ? <SidebarSeparator /> : null}
					{footerGroups.map((group) => (
						<NavigationGroup key={group.id} group={group} renderLink={renderLink} />
					))}
					{sidebarFooter}
					{account && (
						<div className={contentBar ? 'border-t p-2' : undefined}>
							<AccountMenu account={account} renderLink={renderLink} />
						</div>
					)}
				</SidebarFooter>
			)}
			<SidebarRail />
		</Sidebar>
	);

	const mainColumn = (
		<div className='flex min-h-0 min-w-0 flex-1 flex-col'>
			{contentBar ? appBar : null}
			<SidebarInset
				{...contentProps}
				className={cn(
					'min-w-0 flex-1 overflow-auto',
					contentFooter && 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0',
					contentClassName,
				)}
			>
				{children}
			</SidebarInset>
			{contentFooter}
		</div>
	);

	const content = (
		<SidebarProvider
			className='min-h-0 flex-1 flex-col'
			defaultOpen={defaultSidebarOpen}
			open={sidebarOpen}
			onOpenChange={onSidebarOpenChange}
			style={
				sidebarWidth
					? ({ '--sidebar-width': sidebarWidth } as React.CSSProperties)
					: undefined
			}
		>
			{!contentBar ? appBar : null}
			<div className='flex min-h-0 flex-1'>
				{sidebar}
				{mainColumn}
			</div>
		</SidebarProvider>
	);

	return useRender({
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				className: cn('flex min-h-dvh w-full flex-col bg-background', className),
				style: {
					'--app-bar-height': headerHeight,
					...style,
				} as React.CSSProperties,
				children: content,
			},
			props,
		),
		render,
		state: {
			slot: 'app-shell',
		},
	});
}

export { AppShell };
export type {
	AppAccount,
	AppAccountAction,
	AppAccountActionGroup,
	AppIcon,
	AppNavigationChild,
	AppNavigationGroup,
	AppNavigationItem,
	AppShellBrand,
	AppShellProps,
};
