import { useEffect, useRef } from 'react';
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
			<WebviewFocusSink />
			<Toolbar {...model} />
			<FavoritesPanel {...model} />
			<FileList {...model} />
			<ContextMenu {...model} />
			<ArchiveProgress {...model} />
		</div>
	);
}

function WebviewFocusSink() {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, []);

	return <input ref={inputRef} aria-hidden="true" tabIndex={-1} className="webview-focus-sink" />;
}