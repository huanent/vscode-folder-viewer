import type { MouseEvent } from 'react';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { formatDate, formatSize, getFileIcon } from '../lib/formatters';
import type { FileEntry } from '../types';

type FileListProps = Pick<FolderViewerModel, 'state' | 'actions'>;
type SortKey = 'name' | 'created' | 'modified' | 'size';
type SortDirection = 'ascending' | 'descending';
type SortState = { key: SortKey; direction: SortDirection } | null;

const fileGridClasses = 'grid grid-cols-[minmax(180px,1fr)_minmax(150px,210px)_minmax(150px,210px)_90px] items-center gap-x-4 px-2.5 max-[600px]:grid-cols-[minmax(140px,1fr)_72px]';
const rowHeight = 32;
const virtualizeThreshold = 500;
const overscanRows = 8;

export function FileList({ state, actions }: FileListProps) {
	const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
	const [sort, setSort] = useState<SortState>(null);
	const normalizedQuery = state.searchQuery.trim().toLocaleLowerCase();
	const entries = useMemo(() => {
		const filteredEntries = normalizedQuery
			? state.entries.filter(entry => entry.name.toLocaleLowerCase().includes(normalizedQuery))
			: state.entries;
		if (!sort) return filteredEntries;
		const direction = sort.direction === 'ascending' ? 1 : -1;
		return [...filteredEntries].sort((left, right) => direction * compareEntries(left, right, sort.key));
	}, [state.entries, normalizedQuery, sort]);
	const virtual = entries.length > virtualizeThreshold;
	const startIndex = virtual ? Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - overscanRows) : 0;
	const visibleRows = virtual ? Math.ceil(viewport.height / rowHeight) + overscanRows * 2 : entries.length;
	const visibleEntries = virtual ? entries.slice(startIndex, startIndex + visibleRows) : entries;
	const topSpacerHeight = virtual ? startIndex * rowHeight : 0;
	const bottomSpacerHeight = virtual ? Math.max(0, (entries.length - startIndex - visibleEntries.length) * rowHeight) : 0;
	const toggleSort = (key: SortKey, direction: SortDirection) => {
		setSort(current => current?.key === key && current.direction === direction ? null : { key, direction });
	};

	return (
		<main
			data-file-list
			className="h-[calc(100%-46px)] overflow-auto"
			onScroll={event => {
				const target = event.currentTarget;
				setViewport({ scrollTop: target.scrollTop, height: target.clientHeight });
			}}
			onClick={event => {
				if (!(event.target as HTMLElement).closest('[role="option"]')) actions.clearSelection();
			}}
			onContextMenu={event => actions.showContextMenu(event, null)}
		>
			<div className={`${fileGridClasses} sticky top-0 z-2 h-8 border-b border-border bg-app text-xs text-muted`}>
				<SortHeader label={`Name${state.entries.length ? ` (${entries.length}${normalizedQuery ? ` of ${state.entries.length}` : ''})` : ''}`} sortKey="name" sort={sort} onSort={toggleSort} className="pl-6" />
				<SortHeader label="Created" sortKey="created" sort={sort} onSort={toggleSort} className="max-[600px]:hidden" />
				<SortHeader label="Modified" sortKey="modified" sort={sort} onSort={toggleSort} className="max-[600px]:hidden" />
				<SortHeader label="Size" sortKey="size" sort={sort} onSort={toggleSort} className="justify-end" />
			</div>
			<div className="py-1 pb-3" role="listbox" aria-label="Folder contents" aria-multiselectable="true">
				{topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}
				{visibleEntries.map(entry => (
					<FileRow key={entry.uri} entry={entry} state={state} actions={actions} />
				))}
				{bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
			</div>
			{entries.length === 0 && !state.status && <div className="py-11 text-center text-muted">{normalizedQuery ? 'No matching files.' : 'This folder is empty.'}</div>}
			{state.status && <div className="py-11 text-center text-muted" role="status" aria-live="polite">{state.status}</div>}
		</main>
	);
}

function SortHeader({ label, sortKey, sort, onSort, className = '' }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey, direction: SortDirection) => void; className?: string }) {
	const columnLabel = label.replace(/ \(.*/, '');
	return (
		<div className={`group flex h-full min-w-0 items-center overflow-hidden ${className}`}>
			<span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
			<span className={`ml-auto grid h-5 w-5 shrink-0 grid-rows-2 place-items-center ${sort?.key === sortKey ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
				<SortButton label={`Sort ascending by ${columnLabel}`} active={sort?.key === sortKey && sort.direction === 'ascending'} direction="ascending" onClick={() => onSort(sortKey, 'ascending')} />
				<SortButton label={`Sort descending by ${columnLabel}`} active={sort?.key === sortKey && sort.direction === 'descending'} direction="descending" onClick={() => onSort(sortKey, 'descending')} />
			</span>
		</div>
	);
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: SortDirection; onClick: () => void }) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			className="inline-grid h-2.5 w-5 cursor-pointer place-items-center border-0 bg-transparent p-0 text-muted hover:text-foreground focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus"
			onClick={event => {
				onClick();
				if (event.detail > 0) event.currentTarget.blur();
			}}
		>
			<span className={`size-0 border-x-4 border-x-transparent ${direction === 'ascending' ? 'border-b-[6px] border-b-current' : 'border-t-[6px] border-t-current'} ${active ? 'text-foreground opacity-100' : 'opacity-55'}`} />
		</button>
	);
}

function compareEntries(left: FileEntry, right: FileEntry, key: SortKey) {
	if (key === 'name') return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
	if (key === 'size') return getEntrySize(left) - getEntrySize(right);
	return left[key] - right[key];
}

function getEntrySize(entry: FileEntry) {
	return entry.type === 'directory' ? entry.calculatedSize ?? 0 : entry.size;
}

function FileRow({ entry, state, actions }: { entry: FileEntry } & FileListProps) {
	const selected = state.selectedUris.has(entry.uri);
	const cut = state.cutUris.has(entry.uri);
	const classes = selected
		? 'bg-selection text-selection-foreground'
		: 'hover:bg-hover hover:text-hover-foreground';

	return (
		<div
			className={`${fileGridClasses} h-8 cursor-default rounded-sm ${classes} ${cut ? 'opacity-50' : ''}`}
			role="option"
			aria-selected={selected}
			data-uri={entry.uri}
			tabIndex={0}
			title={entry.name}
			onClick={event => actions.selectEntry(entry, event)}
			onDoubleClick={() => actions.openEntry(entry)}
			onKeyDown={event => {
				if (event.key === 'Enter' && state.selectedEntries.length === 1) {
					event.preventDefault();
					actions.renameSelected();
				}
			}}
			onContextMenu={event => actions.showContextMenu(event, entry)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<i className={`codicon ${entry.type === 'directory' ? 'codicon-folder text-folder' : `${getFileIcon(entry.name)} text-file`} shrink-0 text-base ${selected ? 'text-inherit!' : ''}`} />
				<span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
			</div>
			<span className={`entry-created overflow-hidden text-xs text-ellipsis whitespace-nowrap max-[600px]:hidden ${selected ? 'text-inherit' : 'text-muted'}`}>{formatDate(entry.created)}</span>
			<span className={`entry-modified overflow-hidden text-xs text-ellipsis whitespace-nowrap max-[600px]:hidden ${selected ? 'text-inherit' : 'text-muted'}`}>{formatDate(entry.modified)}</span>
			<EntrySize entry={entry} selected={selected} onCalculate={(event) => actions.calculateSize(entry, event.metaKey || event.ctrlKey)} />
		</div>
	);
}

function EntrySize({ entry, selected, onCalculate }: { entry: FileEntry; selected: boolean; onCalculate: (event: MouseEvent) => void }) {
	if (entry.type === 'file') {
		return <span className={`entry-size overflow-hidden text-right text-xs text-ellipsis whitespace-nowrap ${selected ? 'text-inherit' : 'text-muted'}`}>{formatSize(entry.size)}</span>;
	}
	if (entry.calculatedSize !== undefined) {
		return <span className={`entry-size overflow-hidden text-right text-xs text-ellipsis whitespace-nowrap ${selected ? 'text-inherit' : 'text-muted'}`}>{formatSize(entry.calculatedSize)}</span>;
	}
	if (entry.calculationError) {
		return <FolderSizeError message={entry.calculationError} selected={selected} onCalculate={onCalculate} />;
	}
	const label = entry.calculating ? 'Calculating folder size' : 'Calculate folder size (Command/Ctrl+click calculates all folders)';
	return (
		<span className={`entry-size flex justify-end ${selected ? 'text-inherit' : 'text-muted'}`}>
			<button
				type="button"
				title={label}
				aria-label={label}
				disabled={entry.calculating}
				className="grid size-5 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-inherit hover:not-disabled:bg-toolbar-hover focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:cursor-default"
				onClick={event => { event.stopPropagation(); onCalculate(event); }}
				onDoubleClick={event => event.stopPropagation()}
			>
				<i className={`codicon ${entry.calculating ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
			</button>
		</span>
	);
}

function FolderSizeError({ message, selected, onCalculate }: { message: string; selected: boolean; onCalculate: (event: MouseEvent) => void }) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [tooltipStyle, setTooltipStyle] = useState<CSSProperties | null>(null);

	function showTooltip() {
		const rect = buttonRef.current?.getBoundingClientRect();
		if (!rect) return;
		const horizontal = { right: Math.max(8, window.innerWidth - rect.right) };
		setTooltipStyle(rect.top > 72
			? { ...horizontal, bottom: window.innerHeight - rect.top + 4, maxWidth: Math.max(0, Math.min(320, window.innerWidth - 16)), overflowWrap: 'anywhere' }
			: { ...horizontal, top: rect.bottom + 4, maxWidth: Math.max(0, Math.min(320, window.innerWidth - 16)), overflowWrap: 'anywhere' });
	}

	useLayoutEffect(() => {
		const frame = requestAnimationFrame(() => {
			const button = buttonRef.current;
			if (button?.matches(':hover') || document.activeElement === button) showTooltip();
		});
		return () => cancelAnimationFrame(frame);
	}, [message]);

	return (
		<span className={`entry-size flex justify-end ${selected ? 'text-inherit' : 'text-(--vscode-list-warningForeground)'}`}>
			<button
				ref={buttonRef}
				type="button"
				aria-label={`Folder size calculation failed: ${message}`}
				className="grid size-5 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-inherit hover:bg-toolbar-hover focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus"
				onMouseEnter={showTooltip}
				onMouseLeave={() => setTooltipStyle(null)}
				onFocus={showTooltip}
				onBlur={() => setTooltipStyle(null)}
				onClick={event => { event.stopPropagation(); onCalculate(event); }}
				onDoubleClick={event => event.stopPropagation()}
			>
				<i className="codicon codicon-warning" />
			</button>
			{tooltipStyle && createPortal(
				<span className="pointer-events-none fixed z-40 block rounded border border-widget-border bg-notification px-2 py-1.5 text-left text-xs text-foreground shadow-widget whitespace-pre-wrap" role="tooltip" style={tooltipStyle}>
					{message}
				</span>,
				document.body
			)}
		</span>
	);
}