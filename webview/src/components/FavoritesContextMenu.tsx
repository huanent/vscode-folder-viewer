import { useContextMenuPosition } from '../hooks/useContextMenuPosition';

interface FavoritesContextMenuProps {
	x: number;
	y: number;
	onRename: () => void;
	onDelete: () => void;
}

export function FavoritesContextMenu({ x, y, onRename, onDelete }: FavoritesContextMenuProps) {
	const { menuRef, position } = useContextMenuPosition(x, y);
	return (
		<div ref={menuRef} className="fixed z-30 min-w-48 rounded border border-menu-border bg-menu p-1 shadow-menu" role="menu" style={position} onClick={event => event.stopPropagation()}>
			<MenuItem icon="codicon-rename" label="Rename" onClick={onRename} />
			<MenuItem icon="codicon-trash" label="Delete" onClick={onDelete} />
		</div>
	);
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
	return (
		<button className="flex h-7 w-full cursor-pointer items-center gap-2.25 rounded-sm border-0 bg-transparent px-2.25 text-left text-menu-foreground hover:bg-menu-selection hover:text-menu-selection-foreground focus:bg-menu-selection focus:text-menu-selection-foreground focus:outline-none" type="button" role="menuitem" onClick={onClick}>
			<i className={`codicon ${icon} w-4 shrink-0`} />
			<span>{label}</span>
		</button>
	);
}