import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { useContextMenuPosition } from '../hooks/useContextMenuPosition';
import { getFileManagerName, isMac } from '../lib/formatters';

type ContextMenuProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function ContextMenu({ state, actions }: ContextMenuProps) {
	const contextMenu = state.contextMenu;
	const { menuRef, position } = useContextMenuPosition(contextMenu?.x ?? 0, contextMenu?.y ?? 0);
	useLayoutEffect(() => {
		if (contextMenu) menuRef.current?.focus();
	}, [contextMenu, menuRef]);
	if (!contextMenu) return null;
	const selection = state.selectedEntries;
	const targetDirectoryUri = contextMenu.directoryUri ?? (contextMenu.entry?.type === 'directory' ? contextMenu.entry.uri : state.currentUri);
	const hasSelection = Boolean(contextMenu.directoryUri) || selection.length > 0;
	const canOpenFolder = Boolean(contextMenu.directoryUri) || !hasSelection || (selection.length === 1 && selection[0].type === 'directory' && selection[0].uri === contextMenu.entry?.uri);
	const canOpenTerminal = Boolean(contextMenu.directoryUri) || !hasSelection || (selection.length === 1 && selection[0].uri === contextMenu.entry?.uri);
	const canExtract = !contextMenu.directoryUri && selection.length === 1 && selection[0].type === 'file' && selection[0].name.toLowerCase().endsWith('.zip');
	const canPreviewArchive = canExtract && selection[0].uri === contextMenu.entry?.uri;
	const closeAfter = (action: () => void) => () => { action(); actions.closeContextMenu(); };

	return (
		<div
			ref={menuRef}
			className="fixed z-20 min-w-48 rounded border border-(--vscode-menu-border,var(--vscode-panel-border)) bg-(--vscode-menu-background) p-1 shadow-[0_2px_8px_var(--vscode-widget-shadow)]"
			role="menu"
			tabIndex={-1}
			style={position}
			onClick={event => event.stopPropagation()}
			onKeyDown={event => {
				if (event.key !== 'Escape') return;
				event.preventDefault();
				event.stopPropagation();
				actions.closeContextMenu();
			}}
			onBlur={event => {
				if (!event.currentTarget.contains(event.relatedTarget)) actions.closeContextMenu();
			}}
		>
			<MenuItem label="Cut" shortcut={shortcut('⌘X', 'Ctrl+X')} disabled={!hasSelection} onClick={closeAfter(actions.cut)} />
			<MenuItem label="Copy" shortcut={shortcut('⌘C', 'Ctrl+C')} disabled={!hasSelection} onClick={closeAfter(actions.copy)} />
			<MenuItem label="Paste" shortcut={shortcut('⌘V', 'Ctrl+V')} disabled={!state.hasClipboardEntry} onClick={closeAfter(() => actions.paste(targetDirectoryUri))} />
			<MenuItem label="New File" disabled={!!state.contextMenu.entry && state.contextMenu.entry.type !== 'directory'} onClick={closeAfter(() => actions.createFile(targetDirectoryUri))} />
			<MenuItem label="New Folder" disabled={!!state.contextMenu.entry && state.contextMenu.entry.type !== 'directory'} onClick={closeAfter(() => actions.createDirectory(targetDirectoryUri))} />
			<Separator />
			<MenuItem label="Copy Path" shortcut={shortcut('⌥⌘C', 'Shift+Alt+C')} disabled={!hasSelection} onClick={closeAfter(actions.copyPath)} />
			<MenuItem label="Rename" shortcut="F2" disabled={!contextMenu.directoryUri && selection.length !== 1} onClick={closeAfter(actions.renameSelected)} />
			{(canOpenFolder || canOpenTerminal || canPreviewArchive) && <OpenInMenu
				canOpenFolder={canOpenFolder}
				canOpenTerminal={canOpenTerminal}
				canPreviewArchive={canPreviewArchive}
				onOpen={type => closeAfter(() => type === 'previewArchive' ? actions.previewArchive() : actions.openFolder(type))()}
			/>}
			{hasSelection && <Separator />}
			{hasSelection && !canExtract && <MenuItem label="Compress to ZIP" onClick={closeAfter(() => actions.startArchive('compress'))} />}
			{canExtract && <MenuItem label="Extract ZIP" onClick={closeAfter(() => actions.startArchive('extract'))} />}
			<MenuItem label="Delete" shortcut={shortcut('⌘⌫', 'Delete')} disabled={!hasSelection} onClick={event => { actions.delete(event.shiftKey); actions.closeContextMenu(); }} />
		</div>
	);
}

type OpenAction = 'openInCurrentWindow' | 'openInNewTab' | 'openInNewWindow' | 'openInTerminal' | 'openInFileManager' | 'previewArchive';
type OpenMenuItem = { label: string; action: OpenAction };
const submenuViewportPadding = 8;

function OpenInMenu({ canOpenFolder, canOpenTerminal, canPreviewArchive, onOpen }: { canOpenFolder: boolean; canOpenTerminal: boolean; canPreviewArchive: boolean; onOpen: (type: OpenAction) => void }) {
	const items: OpenMenuItem[] = [
		...(canPreviewArchive ? [{ label: 'Preview', action: 'previewArchive' as const }] : []),
		...(canOpenFolder ? [
			{ label: 'Current Window', action: 'openInCurrentWindow' as const },
			{ label: 'New Window', action: 'openInNewWindow' as const },
			{ label: 'New Tab', action: 'openInNewTab' as const }
		] : []),
		...(canOpenTerminal ? [{ label: 'Terminal', action: 'openInTerminal' as const }] : []),
		{ label: getFileManagerName(), action: 'openInFileManager' }
	];

	if (items.length === 1) {
		return <MenuItem label={`Open in ${items[0].label}`} onClick={() => onOpen(items[0].action)} />;
	}

	return <OpenInSubmenu items={items} onOpen={onOpen} />;
}

function OpenInSubmenu({ items, onOpen }: { items: OpenMenuItem[]; onOpen: (type: OpenAction) => void }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const submenuRef = useRef<HTMLDivElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [submenuPosition, setSubmenuPosition] = useState<CSSProperties>({ visibility: 'hidden' });

	function openMenu() {
		setIsOpen(true);
	}

	useLayoutEffect(() => {
		if (!isOpen) return;
		const updatePosition = () => {
			const container = containerRef.current;
			const submenu = submenuRef.current;
			if (!container || !submenu) return;
			const triggerRect = container.getBoundingClientRect();
			const submenuWidth = submenu.offsetWidth;
			const submenuHeight = submenu.offsetHeight;
			const rightPosition = triggerRect.right - 1;
			const leftPosition = triggerRect.left - submenuWidth + 1;
			const openRight = rightPosition + submenuWidth <= window.innerWidth - submenuViewportPadding;
			setSubmenuPosition({
				left: Math.max(submenuViewportPadding, Math.min(openRight ? rightPosition : leftPosition, window.innerWidth - submenuWidth - submenuViewportPadding)),
				top: Math.max(submenuViewportPadding, Math.min(triggerRect.top - 4, window.innerHeight - submenuHeight - submenuViewportPadding)),
				visibility: 'visible'
			});
		};

		updatePosition();
		window.addEventListener('resize', updatePosition);
		return () => window.removeEventListener('resize', updatePosition);
	}, [isOpen]);

	function handleBlur(event: FocusEvent<HTMLDivElement>) {
		if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
	}

	return (
		<div ref={containerRef} className="relative" onMouseEnter={openMenu} onMouseLeave={() => setIsOpen(false)} onFocus={openMenu} onBlur={handleBlur}>
			<MenuItem label="Open in..." submenu aria-haspopup="menu" aria-expanded={isOpen} />
			{isOpen && <div ref={submenuRef} className="fixed z-30 min-w-48 rounded border border-(--vscode-menu-border,var(--vscode-panel-border)) bg-(--vscode-menu-background) p-1 shadow-[0_2px_8px_var(--vscode-widget-shadow)]" role="menu" style={submenuPosition}>
				{items.map(item => <MenuItem key={item.action} label={item.label} onClick={() => onOpen(item.action)} />)}
			</div>}
		</div>
	);
}

function shortcut(mac: string, other: string) {
	return isMac() ? mac : other;
}

function MenuItem({ label, shortcut, submenu, ...props }: { label: string; shortcut?: string; submenu?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button className="flex h-7 w-full cursor-pointer items-center rounded-sm border-0 bg-transparent px-2.25 text-left text-(--vscode-menu-foreground) hover:not-disabled:bg-(--vscode-menu-selectionBackground) hover:not-disabled:text-(--vscode-menu-selectionForeground) focus:not-disabled:bg-(--vscode-menu-selectionBackground) focus:not-disabled:text-(--vscode-menu-selectionForeground) focus:outline-none disabled:cursor-default disabled:opacity-45" type="button" role="menuitem" {...props}>
			<span>{label}</span>
			{shortcut && <span className="ml-auto pl-4.5 text-xs opacity-70">{shortcut}</span>}
			{submenu && <i className="codicon codicon-chevron-right ml-auto w-4 shrink-0" aria-hidden="true" />}
		</button>
	);
}

function Separator(): ReactNode {
	return <div className="mx-1.75 my-1 h-px bg-(--vscode-menu-separatorBackground,var(--vscode-panel-border))" role="separator" />;
}