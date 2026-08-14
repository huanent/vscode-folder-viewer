import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { getRelativePath } from '../lib/formatters';
import { IconButton } from './IconButton';

type FavoritesPanelProps = Pick<FolderViewerModel, 'state' | 'actions'>;

const quickLocations = [
	{ location: 'desktop', icon: 'codicon-device-desktop', label: 'Desktop' },
	{ location: 'documents', icon: 'codicon-file-text', label: 'Documents' },
	{ location: 'downloads', icon: 'codicon-download', label: 'Downloads' },
	{ location: 'tmp', icon: 'codicon-history', label: 'Tmp' },
] as const;

export function FavoritesPanel({ state, actions }: FavoritesPanelProps) {
	return (
		<section
			className="absolute top-[calc(100%+4px)] left-0 z-10 max-h-[min(420px,calc(100vh-64px))] w-full min-w-64 overflow-y-auto rounded border border-(--vscode-widget-border,var(--vscode-panel-border)) bg-(--vscode-menu-background) p-1.5 shadow-[0_4px_16px_var(--vscode-widget-shadow)]"
			aria-label="Favorites"
			onClick={event => event.stopPropagation()}
			onMouseDown={event => event.preventDefault()}
		>
			<nav className="mb-1 grid grid-cols-2 border-b border-(--vscode-menu-separatorBackground,var(--vscode-panel-border)) pb-1 min-[600px]:grid-cols-4" aria-label="Quick locations">
				{quickLocations.map(({ location, icon, label }) => (
					<button
						key={location}
						type="button"
						title={label}
						className="flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm border-0 bg-transparent px-1.5 text-(--vscode-menu-foreground) hover:bg-(--vscode-menu-selectionBackground) hover:text-(--vscode-menu-selectionForeground) focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-(--vscode-focusBorder)"
						onClick={() => {
							actions.setPathInputOpen(false);
							actions.navigateQuickLocation(location);
						}}
					>
						<i className={`codicon ${icon} shrink-0 text-base text-(--vscode-icon-foreground)`} aria-hidden="true" />
						<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
					</button>
				))}
			</nav>
			{state.favoriteUris.length === 0 ? (
				<div className="px-2 py-4.5 text-center text-(--vscode-descriptionForeground)">No favorite folders.</div>
			) : state.favoriteUris.map(uri => {
				const relativePath = getRelativePath(state.rootUri, uri);
				const pathParts = relativePath.split('/');
				const folderName = pathParts.pop() ?? relativePath;
				const parentPath = pathParts.length ? `${pathParts.join('/')}/` : '';
				return (
					<div
						key={uri}
						className="group my-px flex h-8 w-full min-w-0 items-center rounded-sm text-(--vscode-menu-foreground) hover:bg-(--vscode-menu-selectionBackground) hover:text-(--vscode-menu-selectionForeground)"
					>
						<button
							type="button"
							title={relativePath}
							className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden border-0 bg-transparent px-2 text-left text-inherit focus:outline focus-visible:-outline-offset-1 focus-visible:outline-(--vscode-focusBorder)"
							onClick={() => {
								actions.setPathInputOpen(false);
								actions.requestDirectory(uri, true);
							}}
						>
							<i className="codicon codicon-folder shrink-0 text-base text-(--vscode-symbolIcon-folderForeground,var(--vscode-icon-foreground))" />
							<span className="flex min-w-0 overflow-hidden whitespace-nowrap">
								<span className="min-w-0 overflow-hidden text-ellipsis">{parentPath}</span>
								<span className="shrink-0">{folderName}</span>
							</span>
						</button>
						<IconButton
							icon="codicon-trash"
							className="mr-0.5 shrink-0 text-(--vscode-menu-foreground) opacity-0 hover:bg-transparent group-hover:opacity-100 group-focus-within:opacity-100"
							title="Remove from favorites"
							aria-label={`Remove ${relativePath} from favorites`}
							onClick={() => actions.setFavorite(uri, false)}
						/>
					</div>
				);
			})}
		</section>
	);
}