import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	root: 'webview',
	base: './',
	plugins: [react(), tailwindcss()],
	build: {
		outDir: '../media',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				explorer: 'webview/src/main.tsx',
				spreadsheet: 'webview/src/spreadsheetMain.tsx'
			},
			output: {
				entryFileNames: '[name].js',
				assetFileNames: assetInfo => assetInfo.names?.some(name => name.endsWith('.css'))
					? 'explorer.css'
					: 'assets/[name]-[hash][extname]'
			}
		}
	}
});