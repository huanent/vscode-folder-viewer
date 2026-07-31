import { homedir } from 'node:os';
import * as vscode from 'vscode';
import { ViewerManager } from './viewer/manager';

type OpenTarget = {
	rootUri: vscode.Uri;
	currentUri: vscode.Uri;
};

async function resolveOpenTarget(argument?: vscode.Uri): Promise<OpenTarget> {
	let currentUri: vscode.Uri;
	if (argument instanceof vscode.Uri) {
		const stat = await vscode.workspace.fs.stat(argument);
		currentUri = stat.type & vscode.FileType.Directory ? argument : vscode.Uri.joinPath(argument, '..');
	} else {
		currentUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(homedir());
	}

	return {
		rootUri: currentUri.with({ path: '/', query: '', fragment: '' }),
		currentUri
	};
}

export function activate(context: vscode.ExtensionContext): void {
	const viewerManager = new ViewerManager(context);
	viewerManager.register();

	context.subscriptions.push(
		viewerManager,
		vscode.commands.registerCommand('folderViewer.open', async (argument?: vscode.Uri) => {
			const { rootUri, currentUri } = await resolveOpenTarget(argument);
			await viewerManager.openFolderViewer(rootUri, undefined, {
				currentUri: currentUri.toString(),
				history: []
			});
		})
	);
}

export function deactivate(): void { }

