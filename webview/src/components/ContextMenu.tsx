import type { ReactNode } from 'react';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { isMac } from '../lib/formatters';

type ContextMenuProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function ContextMenu({ state, actions }: ContextMenuProps) {
	if (!state.contextMenu) return null;
	const directoryOnly = Boolean(state.contextMenu.directoryUri);
	const selection = state.selectedEntries;
	const hasSelection = !directoryOnly && selection.length > 0;
	const canOpenFolder = !hasSelection || (selection.length === 1 && selection[0].type === 'directory' && selection[0].uri === state.contextMenu.entry?.uri);
	const canOpenTerminal = !hasSelection || (selection.length === 1 && selection[0].uri === state.contextMenu.entry?.uri);
	const canExtract = selection.length === 1 && selection[0].type === 'file' && selection[0].name.toLowerCase().endsWith('.zip');
	const closeAfter = (action: () => void) => () => { action(); actions.closeContextMenu(); };
	const left = Math.max(8, Math.min(state.contextMenu.x, window.innerWidth - 210));
	const top = Math.max(8, Math.min(state.contextMenu.y, window.innerHeight - 330));

	return (
		<div className="fixed z-20 min-w-48 rounded border border-menu-border bg-menu p-1 shadow-menu" role="menu" style={{ left, top }} onClick={event => event.stopPropagation()}>
			{directoryOnly && <>
				<MenuItem icon="codicon-copy" label="Copy Path" onClick={closeAfter(() => actions.copyPath(state.contextMenu?.directoryUri))} />
				<Separator />
				<MenuItem icon="codicon-file-symlink-directory" label="Open in New Tab" onClick={closeAfter(() => actions.openFolder('openInNewTab'))} />
				<MenuItem icon="codicon-folder-opened" label="Open in Current Window" onClick={closeAfter(() => actions.openFolder('openInCurrentWindow'))} />
				<MenuItem icon="codicon-open-in-window" label="Open in New Window" onClick={closeAfter(() => actions.openFolder('openInNewWindow'))} />
				<MenuItem icon="codicon-terminal" label="Open in Terminal" onClick={closeAfter(() => actions.openFolder('openInTerminal'))} />
			</>}
			{!directoryOnly && <>
			<MenuItem icon="codicon-screen-cut" label="Cut" shortcut={shortcut('⌘X', 'Ctrl+X')} disabled={!hasSelection} onClick={closeAfter(actions.cut)} />
			<MenuItem icon="codicon-copy" label="Copy" shortcut={shortcut('⌘C', 'Ctrl+C')} disabled={!hasSelection} onClick={closeAfter(actions.copy)} />
			<MenuItem icon="codicon-clippy" label="Paste" shortcut={shortcut('⌘V', 'Ctrl+V')} disabled={!state.hasClipboardEntry} onClick={closeAfter(() => actions.paste(state.contextMenu?.entry?.type === 'directory' ? state.contextMenu.entry.uri : state.currentUri))} />
			<MenuItem icon="codicon-new-file" label="New File" disabled={!!state.contextMenu.entry && state.contextMenu.entry.type !== 'directory'} onClick={closeAfter(() => actions.createFile(state.contextMenu?.entry?.type === 'directory' ? state.contextMenu.entry.uri : state.currentUri))} />
			<MenuItem icon="codicon-new-folder" label="New Folder" disabled={!!state.contextMenu.entry && state.contextMenu.entry.type !== 'directory'} onClick={closeAfter(() => actions.createDirectory(state.contextMenu?.entry?.type === 'directory' ? state.contextMenu.entry.uri : state.currentUri))} />
			<Separator />
			<MenuItem icon="codicon-copy" label="Copy Path" shortcut={shortcut('⌥⌘C', 'Shift+Alt+C')} disabled={!hasSelection} onClick={closeAfter(actions.copyPath)} />
			<MenuItem icon="codicon-rename" label="Rename" shortcut="F2" disabled={selection.length !== 1} onClick={closeAfter(actions.renameSelected)} />
			{canOpenFolder && <>
					<MenuItem icon="codicon-folder-opened" label="Open in Current Window" onClick={closeAfter(() => actions.openFolder('openInCurrentWindow'))} />
					<MenuItem icon="codicon-open-in-window" label="Open in New Window" onClick={closeAfter(() => actions.openFolder('openInNewWindow'))} />
				<MenuItem icon="codicon-file-symlink-directory" label="Open in New Tab" onClick={closeAfter(() => actions.openFolder('openInNewTab'))} />
			</>}
			{canOpenTerminal && <MenuItem icon="codicon-terminal" label="Open in Terminal" onClick={closeAfter(() => actions.openFolder('openInTerminal'))} />}
			{hasSelection && <Separator />}
			{hasSelection && !canExtract && <MenuItem icon="codicon-file-zip" label="Compress to ZIP" onClick={closeAfter(() => actions.startArchive('compress'))} />}
			{canExtract && <MenuItem icon="codicon-file-zip" label="Extract ZIP" onClick={closeAfter(() => actions.startArchive('extract'))} />}
			<MenuItem icon="codicon-trash" label="Delete" shortcut={shortcut('⌘⌫', 'Delete')} disabled={!hasSelection} onClick={event => { actions.delete(event.shiftKey); actions.closeContextMenu(); }} />
			</>}
		</div>
	);
}

function shortcut(mac: string, other: string) {
	return isMac() ? mac : other;
}

function MenuItem({ icon, label, shortcut, ...props }: { icon: string; label: string; shortcut?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button className="flex h-7 w-full cursor-pointer items-center gap-2.25 rounded-sm border-0 bg-transparent px-2.25 text-left text-menu-foreground hover:not-disabled:bg-menu-selection hover:not-disabled:text-menu-selection-foreground focus:not-disabled:bg-menu-selection focus:not-disabled:text-menu-selection-foreground focus:outline-none disabled:cursor-default disabled:opacity-45" type="button" role="menuitem" {...props}>
			<i className={`codicon ${icon} w-4 shrink-0`} />
			<span>{label}</span>
			{shortcut && <span className="ml-auto pl-4.5 text-xs opacity-70">{shortcut}</span>}
		</button>
	);
}

function Separator(): ReactNode {
	return <div className="mx-1.75 my-1 h-px bg-menu-separator" role="separator" />;
}