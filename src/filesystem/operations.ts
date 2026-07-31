import * as vscode from 'vscode';
import { confirmOverwrite, getDisplayName } from './entry';

export interface ClipboardState {
	uris: vscode.Uri[];
	operation: 'cut' | 'copy';
}

export interface PasteResult {
	completedUris: vscode.Uri[];
	changed: boolean;
}

export async function renameEntry(targetUri: vscode.Uri): Promise<boolean> {
	const currentName = getDisplayName(targetUri);
	const newName = await vscode.window.showInputBox({
		title: 'Rename',
		prompt: 'Enter a new name',
		value: currentName,
		valueSelection: [0, currentName.length],
		validateInput: value => validateEntryName(value)
	});
	if (newName === undefined || newName === currentName) {
		return false;
	}

	const parentUri = vscode.Uri.joinPath(targetUri, '..');
	await vscode.workspace.fs.rename(targetUri, vscode.Uri.joinPath(parentUri, newName), { overwrite: false });
	return true;
}

export async function createDirectory(parentUri: vscode.Uri): Promise<boolean> {
	const name = await vscode.window.showInputBox({
		title: 'New Folder',
		prompt: 'Enter a folder name',
		value: 'New Folder',
		valueSelection: [0, 'New Folder'.length],
		validateInput: value => validateEntryName(value)
	});
	if (name === undefined) {
		return false;
	}

	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(parentUri, name));
	return true;
}

export async function deleteEntries(targetUris: vscode.Uri[], permanent: boolean): Promise<boolean> {
	if (targetUris.length === 0) {
		return false;
	}
	if (permanent) {
		if (!await confirmPermanentDelete(targetUris)) {
			return false;
		}
	}

	try {
		await deleteTargetUris(targetUris, !permanent);
	} catch (error) {
		if (permanent || !isTrashUnsupportedError(error)) {
			throw error;
		}
		if (!await confirmPermanentDelete(targetUris, 'Trash is not supported for this location.')) {
			return false;
		}
		await deleteTargetUris(targetUris, false);
	}
	return true;
}

async function confirmPermanentDelete(targetUris: vscode.Uri[], detail = 'This action cannot be undone.'): Promise<boolean> {
	const label = targetUris.length === 1 ? `"${getDisplayName(targetUris[0])}"` : `${targetUris.length} items`;
	const choice = await vscode.window.showWarningMessage(
		`Permanently delete ${label}?`,
		{ modal: true, detail },
		'Delete Permanently'
	);
	return choice === 'Delete Permanently';
}

async function deleteTargetUris(targetUris: vscode.Uri[], useTrash: boolean): Promise<void> {
	for (const targetUri of targetUris) {
		await vscode.workspace.fs.delete(targetUri, { recursive: true, useTrash });
	}
}

function isTrashUnsupportedError(error: unknown): boolean {
	return error instanceof Error && /trash.*provider does not support|provider does not support.*trash/i.test(error.message);
}

export async function pasteEntries(clipboardState: ClipboardState, destinationDirectoryUri: vscode.Uri): Promise<PasteResult> {
	const destinationStat = await vscode.workspace.fs.stat(destinationDirectoryUri);
	if (!(destinationStat.type & vscode.FileType.Directory)) {
		throw new Error('Items can only be pasted into a folder.');
	}
	const completedUris: vscode.Uri[] = [];
	let changed = false;
	for (const sourceUri of clipboardState.uris) {
		const result = await pasteEntry(sourceUri, clipboardState.operation, destinationDirectoryUri);
		changed ||= result.changed;
		if (result.completed) {
			completedUris.push(sourceUri);
		}
	}
	return { completedUris, changed };
}

interface PasteEntryResult {
	completed: boolean;
	changed: boolean;
}

async function pasteEntry(sourceUri: vscode.Uri, operation: 'cut' | 'copy', destinationDirectoryUri: vscode.Uri): Promise<PasteEntryResult> {
	const targetUri = vscode.Uri.joinPath(destinationDirectoryUri, getDisplayName(sourceUri));
	const sourceStat = await vscode.workspace.fs.stat(sourceUri);
	if (targetUri.toString() === sourceUri.toString()) {
		if (sourceStat.type & vscode.FileType.Directory) {
			await confirmDirectoryConflict(targetUri);
		} else {
			await confirmOverwrite(targetUri);
		}
		return { completed: false, changed: false };
	}

	const sourcePath = sourceUri.path.endsWith('/') ? sourceUri.path : `${sourceUri.path}/`;
	if ((sourceStat.type & vscode.FileType.Directory) && destinationDirectoryUri.path.startsWith(sourcePath)) {
		throw new Error('A folder cannot be pasted into itself.');
	}

	let overwrite = false;
	try {
		const targetStat = await vscode.workspace.fs.stat(targetUri);
		if ((sourceStat.type & vscode.FileType.Directory) && (targetStat.type & vscode.FileType.Directory)) {
			const choice = await confirmDirectoryConflict(targetUri);
			if (choice === 'merge') {
				return mergeDirectory(sourceUri, targetUri, operation);
			}
			if (choice !== 'replace') {
				return { completed: false, changed: false };
			}
			await vscode.workspace.fs.delete(targetUri, { recursive: true });
		} else {
			if (!(await confirmOverwrite(targetUri))) {
				return { completed: false, changed: false };
			}
			overwrite = true;
		}
	} catch (error) {
		if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
			throw error;
		}
	}

	if (operation === 'cut') {
		await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite });
	} else {
		await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite });
	}
	return { completed: true, changed: true };
}

async function mergeDirectory(sourceUri: vscode.Uri, targetUri: vscode.Uri, operation: 'cut' | 'copy'): Promise<PasteEntryResult> {
	const entries = await vscode.workspace.fs.readDirectory(sourceUri);
	let completed = true;
	let changed = false;
	for (const [name] of entries) {
		const result = await pasteEntry(vscode.Uri.joinPath(sourceUri, name), operation, targetUri);
		completed &&= result.completed;
		changed ||= result.changed;
	}

	if (operation === 'cut' && completed) {
		await vscode.workspace.fs.delete(sourceUri);
		changed = true;
	}
	return { completed, changed };
}

function validateEntryName(value: string): string | undefined {
	if (!value.trim()) {
		return 'The name cannot be empty.';
	}
	if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
		return 'The name cannot contain path separators.';
	}
	return undefined;
}

async function confirmDirectoryConflict(targetUri: vscode.Uri): Promise<'merge' | 'replace' | undefined> {
	const choice = await vscode.window.showWarningMessage(
		`A folder named "${getDisplayName(targetUri)}" already exists.`,
		{ modal: true, detail: 'Merge keeps existing items. Replace deletes the existing folder first.' },
		'Merge',
		'Replace'
	);
	if (choice === 'Merge') {
		return 'merge';
	}
	if (choice === 'Replace') {
		return 'replace';
	}
	return undefined;
}