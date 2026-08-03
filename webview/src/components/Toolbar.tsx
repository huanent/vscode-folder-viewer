import { useEffect, useRef, useState } from 'react';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { IconButton } from './IconButton';

type ToolbarProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function Toolbar({ state, actions }: ToolbarProps) {
	const breadcrumbsRef = useRef<HTMLElement>(null);
	const pathInputRef = useRef<HTMLInputElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [pathValue, setPathValue] = useState('');
	const favorite = state.favoriteUris.includes(state.currentUri);
	const favoriteLabel = favorite ? 'Remove current folder from favorites' : 'Add current folder to favorites';
	const crumbs = getBreadcrumbs(state.rootUri, state.currentUri);

	useEffect(() => {
		breadcrumbsRef.current?.scrollTo({ left: breadcrumbsRef.current.scrollWidth });
	}, [state.currentUri]);

	useEffect(() => {
		if (!state.pathInputOpen) return;
		setPathValue(getPathInputValue(state.currentUri));
		requestAnimationFrame(() => pathInputRef.current?.select());
	}, [state.pathInputOpen, state.currentUri]);

	useEffect(() => {
		if (!state.searchOpen) return;
		requestAnimationFrame(() => searchInputRef.current?.focus());
	}, [state.searchOpen]);

	return (
		<header className="grid h-11.5 grid-cols-[auto_minmax(0,1fr)_28px] items-center gap-1 border-b border-border bg-app max-[600px]:gap-1.5 max-[600px]:px-2">
			<div className="flex items-center gap-0.5" role="toolbar" aria-label="Navigation">
				<IconButton icon="codicon-arrow-left" title="Back" aria-label="Back" disabled={!state.history.length} onClick={actions.navigateBack} />
				<IconButton icon="codicon-refresh" title="Refresh" aria-label="Refresh" onClick={() => actions.requestDirectory(state.currentUri, false)} />
			</div>
			<div className="grid h-7.5 min-w-0 grid-cols-[minmax(0,1fr)_28px] items-center overflow-hidden rounded border border-input-border bg-input">
				{state.searchOpen ? (
					<div className="flex h-full min-w-0 items-center gap-1 pl-1.5">
						<i className="codicon codicon-search shrink-0 text-muted" aria-hidden="true" />
						<input
							ref={searchInputRef}
							value={state.searchQuery}
							onChange={event => actions.setSearchQuery(event.target.value)}
							onKeyDown={event => {
								if (event.key === 'Escape') {
									event.preventDefault();
									event.stopPropagation();
									actions.setSearchQuery('');
									actions.setSearchOpen(false);
								}
							}}
							className="h-full min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none"
							aria-label="Search files"
							placeholder="Search files"
							spellCheck={false}
						/>
					</div>
				) : state.pathInputOpen ? (
					<form className="h-full min-w-0" onSubmit={event => { event.preventDefault(); actions.navigatePath(pathValue); }}>
						<input
							ref={pathInputRef}
							value={pathValue}
							onChange={event => setPathValue(event.target.value)}
							onKeyDown={event => {
								if (event.key === 'Escape') {
									event.stopPropagation();
									actions.setPathInputOpen(false);
								}
							}}
							className="h-full w-full border-0 bg-transparent px-1.5 text-foreground outline-none"
							aria-label="Go to path"
							spellCheck={false}
						/>
					</form>
				) : <nav ref={breadcrumbsRef} className="scrollbar-none flex h-full min-w-0 items-center overflow-x-auto pl-1 [&::-webkit-scrollbar]:hidden" aria-label="Folder path">
					{crumbs.map((crumb, index) => (
						<span className="flex shrink-0 items-center" key={crumb.uri}>
							{index > 0 && <i className="codicon codicon-chevron-right shrink-0 text-breadcrumb" />}
							<button
								type="button"
								title={crumb.label}
								aria-label={crumb.label}
								aria-current={index === crumbs.length - 1 ? 'page' : undefined}
								disabled={index === crumbs.length - 1}
								className="flex max-w-55 shrink-0 cursor-pointer items-center overflow-hidden rounded-sm border-0 bg-transparent px-1.25 py-0.5 text-breadcrumb text-ellipsis whitespace-nowrap hover:bg-breadcrumb-hover hover:text-breadcrumb-focus focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:cursor-default disabled:font-semibold disabled:text-breadcrumb-active"
								onClick={() => actions.requestDirectory(crumb.uri, true)}
								onContextMenu={event => actions.showDirectoryContextMenu(event, crumb.uri)}
							>
								{index === 0 ? <i className={`codicon codicon-home ${index === crumbs.length - 1 ? 'breadcrumb-active-icon' : ''}`} aria-hidden="true" /> : crumb.label}
							</button>
						</span>
					))}
				</nav>}
				{state.searchOpen ? (
					<IconButton
						icon="codicon-close"
						className="rounded-none hover:bg-transparent"
						title="Close search"
						aria-label="Close search"
						onClick={() => { actions.setSearchQuery(''); actions.setSearchOpen(false); }}
					/>
				) : (
					<IconButton
						icon={favorite ? 'codicon-star-full' : 'codicon-star-empty'}
						active={favorite}
						className="rounded-none hover:bg-transparent"
						title={favoriteLabel}
						aria-label={favoriteLabel}
						aria-pressed={favorite}
						onClick={() => actions.setFavorite(state.currentUri, !favorite)}
					/>
				)}
			</div>
			<IconButton
				icon="codicon-bookmark"
				title="Favorites"
				aria-label="Favorites"
				aria-expanded={state.favoritesOpen}
				onClick={event => {
					event.stopPropagation();
					actions.setFavoritesOpen(!state.favoritesOpen);
				}}
			/>
		</header>
	);
}

function getPathInputValue(uriValue: string) {
	const uri = new URL(uriValue);
	const pathname = decodeURIComponent(uri.pathname);
	if (uri.protocol !== 'file:') return pathname;
	if (uri.host) return `//${uri.host}${pathname}`;
	return /^\/[a-z]:\//i.test(pathname) ? pathname.slice(1) : pathname;
}

function getBreadcrumbs(rootUri: string, currentUri: string) {
	const root = new URL(rootUri);
	const current = new URL(currentUri);
	const rootParts = decodeURIComponent(root.pathname).split('/').filter(Boolean);
	const relativeParts = decodeURIComponent(current.pathname).split('/').filter(Boolean).slice(rootParts.length);
	const labels = [rootParts.at(-1) || '/', ...relativeParts];
	return labels.map((label, index) => {
		const target = new URL(rootUri);
		target.pathname = `/${[...rootParts, ...relativeParts.slice(0, index)].join('/')}`;
		return { label, uri: target.toString() };
	});
}