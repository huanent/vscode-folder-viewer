import * as vscode from 'vscode';

export interface ViewerViewState {
	currentUri: string;
	history: string[];
}

export function getWebviewHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	rootUri: vscode.Uri,
	folderName: string,
	initialViewState: ViewerViewState
): string {
	const nonce = getNonce();
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'explorer.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'explorer.js'));
	const codiconsUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
	);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<link rel="stylesheet" href="${codiconsUri}">
	<link rel="stylesheet" href="${styleUri}">
	<title>${escapeHtml(folderName)}</title>
</head>
	<body>
	<div
		id="root"
		data-root-uri="${escapeHtml(rootUri.toString())}"
		data-current-uri="${escapeHtml(initialViewState.currentUri)}"
		data-history="${escapeHtml(JSON.stringify(initialViewState.history))}"
	></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function getNonce(): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return nonce;
}