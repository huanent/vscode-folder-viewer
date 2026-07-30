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
			input: 'webview/src/main.tsx',
			output: {
				entryFileNames: 'explorer.js',
				assetFileNames: assetInfo => assetInfo.names?.some(name => name.endsWith('.css'))
					? 'explorer.css'
					: 'assets/[name]-[hash][extname]'
			}
		}
	}
});