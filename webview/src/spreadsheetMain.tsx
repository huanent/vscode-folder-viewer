import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetPreview } from './components/SpreadsheetPreview';
import type { SpreadsheetSheet } from '../../src/spreadsheet';
import './styles.css';

type SpreadsheetMessage =
	| { type: 'loaded'; sheets: SpreadsheetSheet[] }
	| { type: 'error'; message: string };

const vscode = acquireVsCodeApi();

const root = document.getElementById('root');
if (!root) {
	throw new Error('The spreadsheet preview root element is missing.');
}

const name = root.dataset.name ?? '';

createRoot(root).render(
	<StrictMode>
		<SpreadsheetLoader name={name} />
	</StrictMode>
);

function SpreadsheetLoader({ name }: { name: string }) {
	const [message, setMessage] = useState<SpreadsheetMessage>();

	useEffect(() => {
		const handleMessage = (event: MessageEvent<SpreadsheetMessage>) => setMessage(event.data);
		window.addEventListener('message', handleMessage);
		vscode.postMessage({ type: 'ready' });
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	if (message?.type === 'loaded') return <SpreadsheetPreview name={name} sheets={message.sheets} />;
	return <main className="grid h-full place-items-center bg-(--vscode-editor-background) text-sm text-(--vscode-descriptionForeground)">
		{message?.type === 'error' ? `Unable to read spreadsheet: ${message.message}` : 'Reading spreadsheet...'}
	</main>;
}