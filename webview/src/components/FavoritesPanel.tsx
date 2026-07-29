import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { getRelativePath } from '../lib/formatters';
import { IconButton } from './IconButton';

type FavoritesPanelProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function FavoritesPanel({ state, actions }: FavoritesPanelProps) {
	if (!state.favoritesOpen) return null;

	return (
		<section
			className="fixed top-11 right-1 z-10 max-h-[min(420px,calc(100%-64px))] w-[min(340px,calc(100%-24px))] overflow-y-auto rounded border border-widget-border bg-menu p-1.5 shadow-widget max-[600px]:right-auto max-[600px]:left-3"
			aria-label="Favorites"
			onClick={event => event.stopPropagation()}
		>
			<div className="flex h-7.5 items-center justify-between pl-2 text-xs font-semibold text-muted">
				<span>Favorites</span>
				<IconButton icon="codicon-close" title="Close favorites" aria-label="Close favorites" onClick={() => actions.setFavoritesOpen(false)} />
			</div>
			{state.favoriteUris.length === 0 ? (
				<div className="px-2 py-4.5 text-center text-muted">No favorite folders.</div>
			) : state.favoriteUris.map(uri => {
				const relativePath = getRelativePath(state.rootUri, uri);
				const parts = relativePath.split('/');
				const name = parts.pop();
				const parent = parts.join('/');
				return (
					<button
						key={uri}
						type="button"
						title={relativePath}
						className="my-px flex h-11.5 w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-sm border-0 bg-transparent px-2 text-left text-menu-foreground hover:bg-menu-selection hover:text-menu-selection-foreground focus:bg-menu-selection focus:text-menu-selection-foreground focus:outline-none"
						onClick={() => {
							actions.setFavoritesOpen(false);
							actions.requestDirectory(uri, true);
						}}
					>
						<i className="codicon codicon-folder shrink-0 text-base text-folder" />
						<span className="grid min-w-0 gap-0.5">
							<span className="overflow-hidden font-semibold text-ellipsis whitespace-nowrap">{name}</span>
							{parent && <span className="overflow-hidden text-[11px] text-muted text-ellipsis whitespace-nowrap">{parent}</span>}
						</span>
					</button>
				);
			})}
		</section>
	);
}