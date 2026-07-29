import { ArchiveProgress } from './components/ArchiveProgress';
import { ContextMenu } from './components/ContextMenu';
import { FavoritesPanel } from './components/FavoritesPanel';
import { FileList } from './components/FileList';
import { Toolbar } from './components/Toolbar';
import { useFolderViewer } from './hooks/useFolderViewer';

interface AppProps {
	rootElement: HTMLElement;
}

export function App({ rootElement }: AppProps) {
	const model = useFolderViewer(rootElement);
	return (
		<div className="h-full p-1" onClick={() => { model.actions.closeContextMenu(); model.actions.setFavoritesOpen(false); }}>
			<Toolbar {...model} />
			<FavoritesPanel {...model} />
			<FileList {...model} />
			<ContextMenu {...model} />
			<ArchiveProgress {...model} />
		</div>
	);
}