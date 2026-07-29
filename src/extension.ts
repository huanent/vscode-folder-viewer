import { homedir } from 'node:os';
import * as vscode from 'vscode';
import { ViewerManager } from './viewer/manager';

type OpenCommandOptions = {
	openHomeDirectory?: boolean;
};

export function activate(context: vscode.ExtensionContext): void {
	const viewerManager = new ViewerManager(context);
	viewerManager.register();

	context.subscriptions.push(
		viewerManager,
		vscode.commands.registerCommand('folderViewer.open', async (argument?: vscode.Uri | OpenCommandOptions) => {
			const rootUri = argument instanceof vscode.Uri
				? argument
				: argument?.openHomeDirectory
					? vscode.Uri.file(homedir())
					: (await vscode.window.showOpenDialog({
						defaultUri: vscode.Uri.file(homedir()),
						canSelectFiles: false,
						canSelectFolders: true,
						canSelectMany: false,
						openLabel: 'Open'
					}))?.[0];
			if (rootUri) {
				await viewerManager.openFolderViewer(rootUri);
			}
		})
	);
}

export function deactivate(): void { }

