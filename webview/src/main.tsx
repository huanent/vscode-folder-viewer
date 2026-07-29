import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
	throw new Error('The Folder Viewer root element is missing.');
}

createRoot(root).render(
	<StrictMode>
		<App rootElement={root} />
	</StrictMode>
);