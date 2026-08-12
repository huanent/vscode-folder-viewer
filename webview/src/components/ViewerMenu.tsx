import { useEffect, useRef, useState } from 'react';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { IconButton } from './IconButton';

type ViewerMenuProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function ViewerMenu({ state, actions }: ViewerMenuProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const hasPendingFolderSizes = state.entries.some(entry => entry.type === 'directory' && entry.calculatedSize === undefined && !entry.calculating);

	useEffect(() => {
		if (!open) return;
		const close = (event: MouseEvent) => {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [open]);

	return (
		<div
			ref={containerRef}
			className="relative"
			onBlur={event => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
		>
			<IconButton
				icon="codicon-menu"
				title="View options"
				aria-label="View options"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={event => {
					event.stopPropagation();
					setOpen(current => !current);
				}}
			/>
			{open && (
				<div className="absolute top-[calc(100%+4px)] right-0 z-20 min-w-52 rounded border border-menu-border bg-menu p-1 shadow-menu" role="menu" onClick={event => event.stopPropagation()}>
					<MenuItem
						label="Calculate All Folder Sizes"
						disabled={!hasPendingFolderSizes}
						onClick={() => {
							actions.calculateAllFolderSizes();
							setOpen(false);
						}}
					/>
				</div>
			)}
		</div>
	);
}

function MenuItem({ label, ...props }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button className="flex h-7 w-full cursor-pointer items-center rounded-sm border-0 bg-transparent px-2.25 text-left text-menu-foreground hover:not-disabled:bg-menu-selection hover:not-disabled:text-menu-selection-foreground focus:not-disabled:bg-menu-selection focus:not-disabled:text-menu-selection-foreground focus:outline-none disabled:cursor-default disabled:opacity-45" type="button" role="menuitem" {...props}>
			<span>{label}</span>
		</button>
	);
}