'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import * as React from 'react';

import { useFloatingOverlayPortalProps } from '@/components/ui/portal';
import { cn } from '@/lib/utils';

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot='popover' {...props} />;
}

type PopoverTriggerProps = React.ComponentProps<typeof PopoverPrimitive.Trigger> & {
	/** When true, merges props onto the child element instead of rendering a button */
	asChild?: boolean;
};

function PopoverTrigger({ asChild, children, render, ...props }: PopoverTriggerProps) {
	const childRender = render === undefined && asChild && React.isValidElement(children) ? children : undefined;

	return (
		<PopoverPrimitive.Trigger data-slot='popover-trigger' render={render ?? childRender} {...props}>
			{childRender ? undefined : children}
		</PopoverPrimitive.Trigger>
	);
}

type PopoverContentProps = React.ComponentProps<typeof PopoverPrimitive.Popup> & {
	sideOffset?: number;
	side?: 'top' | 'bottom' | 'left' | 'right';
	align?: 'start' | 'center' | 'end';
};

function PopoverContent({
	className,
	sideOffset = 6,
	side = 'bottom',
	align = 'center',
	children,
	...props
}: PopoverContentProps) {
	const { container, zIndexClass } = useFloatingOverlayPortalProps();

	return (
		<PopoverPrimitive.Portal container={container}>
			<PopoverPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className={zIndexClass}>
				<PopoverPrimitive.Popup
					data-slot='popover-content'
					className={cn(
						`bg-popover text-popover-foreground origin-(--transform-origin) rounded-lg border p-4 shadow-md
						transition-[scale,opacity] duration-150 ease-out data-starting-style:scale-95
						data-ending-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0
						motion-reduce:transition-none`,
						className,
					)}
					{...props}
				>
					{children}
				</PopoverPrimitive.Popup>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverContent, PopoverTrigger };
