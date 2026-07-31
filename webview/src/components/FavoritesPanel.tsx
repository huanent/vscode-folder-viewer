import { useState } from 'react';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { getRelativePath } from '../lib/formatters';
import { FavoritesContextMenu } from './FavoritesContextMenu';
import { IconButton } from './IconButton';

type FavoritesPanelProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function FavoritesPanel({ state, actions }: FavoritesPanelProps) {
	const [contextMenu, setContextMenu] = useState<{ uri: string; x: number; y: number } | null>(null);
	if (!state.favoritesOpen) return null;

	return (
		<section
			className="fixed top-11 right-1 z-10 max-h-[min(420px,calc(100%-64px))] w-[min(340px,calc(100%-24px))] overflow-y-auto rounded border border-widget-border bg-menu p-1.5 shadow-widget max-[600px]:right-auto max-[600px]:left-3"
			aria-label="Favorites"
			onClick={event => { event.stopPropagation(); setContextMenu(null); }}
		>
			<div className="flex h-7.5 items-center justify-between pl-2 text-xs font-semibold text-muted">
				<span>Favorites</span>
				<IconButton icon="codicon-close" title="Close favorites" aria-label="Close favorites" onClick={() => actions.setFavoritesOpen(false)} />
			</div>
			{state.favoriteUris.length === 0 ? (
				<div className="px-2 py-4.5 text-center text-muted">No favorite folders.</div>
			) : state.favoriteUris.map(uri => {
				const relativePath = getRelativePath(state.rootUri, uri);
				const customName = state.favoriteNames[uri];
				const pathParts = relativePath.split('/');
				const folderName = pathParts.pop() ?? relativePath;
				const parentPath = pathParts.length ? `${pathParts.join('/')}/` : '';
				return (
					<button
						key={uri}
						type="button"
						title={relativePath}
						className="my-px flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-sm border-0 bg-transparent px-2 text-left text-menu-foreground hover:bg-menu-selection hover:text-menu-selection-foreground focus:bg-menu-selection focus:text-menu-selection-foreground focus:outline-none"
						onClick={() => {
							actions.setFavoritesOpen(false);
							actions.requestDirectory(uri, true);
						}}
						onContextMenu={event => {
							event.preventDefault();
							event.stopPropagation();
							setContextMenu({ uri, x: event.clientX, y: event.clientY });
						}}
					>
						<i className="codicon codicon-folder shrink-0 text-base text-folder" />
						{customName ? (
							<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{customName}</span>
						) : (
							<span className="flex min-w-0 overflow-hidden whitespace-nowrap">
								<span className="min-w-0 overflow-hidden text-ellipsis">{parentPath}</span>
								<span className="shrink-0">{folderName}</span>
							</span>
						)}
					</button>
				);
			})}
			{contextMenu && <FavoritesContextMenu
				x={contextMenu.x}
				y={contextMenu.y}
				onRename={() => { actions.renameFavorite(contextMenu.uri); setContextMenu(null); }}
				onDelete={() => { actions.setFavorite(contextMenu.uri, false); setContextMenu(null); }}
			/>}
		</section>
	);
}