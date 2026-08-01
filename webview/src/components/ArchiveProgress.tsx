import type { FolderViewerModel } from '../hooks/useFolderViewer';

type ArchiveProgressProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function ArchiveProgress({ state, actions }: ArchiveProgressProps) {
	const operation = state.archiveOperation;
	if (!operation) return null;
	const title = operation.kind === 'compress'
		? 'Compressing'
		: operation.kind === 'extract'
			? 'Extracting'
			: operation.kind === 'copy'
				? 'Copying'
				: 'Moving';
	return (
		<section className="fixed right-4 bottom-4 z-15 flex min-h-21.5 w-[min(440px,calc(100%-32px))] items-center gap-3.5 rounded-md border border-widget-border bg-notification px-3.5 py-3 shadow-widget" role="status" aria-live="polite">
			<div className="min-w-0 flex-1">
				<div className="flex justify-between gap-3 font-semibold">
					<span>{title}</span>
					<span>{Math.round(operation.percent)}%</span>
				</div>
				<div className="mt-2.25 h-0.75 overflow-hidden bg-progress-track" aria-hidden="true">
					<div className="h-full bg-button transition-[width] duration-120 ease-linear" style={{ width: `${operation.percent}%` }} />
				</div>
				<div className="mt-1.75 overflow-hidden text-xs text-muted text-ellipsis whitespace-nowrap">{operation.detail}</div>
			</div>
			<button type="button" disabled={operation.cancelling} className="h-7 min-w-18 shrink-0 cursor-pointer rounded-sm border-0 bg-button px-3 text-button-foreground hover:not-disabled:bg-button-hover disabled:cursor-default disabled:opacity-60" onClick={actions.cancelArchive}>
				{operation.cancelling ? 'Cancelling...' : 'Cancel'}
			</button>
		</section>
	);
}