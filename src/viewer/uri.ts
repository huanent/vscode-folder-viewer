import * as vscode from 'vscode';

export function getSafeUri(rootUri: vscode.Uri, value: string): vscode.Uri {
	const candidate = vscode.Uri.parse(value);
	if (!isUriWithinRoot(rootUri, candidate)) {
		throw new Error('The requested item is outside the opened folder.');
	}
	return candidate;
}

export function isUriWithinRoot(rootUri: vscode.Uri, value: string | vscode.Uri): boolean {
	let candidate: vscode.Uri;
	try {
		candidate = typeof value === 'string' ? vscode.Uri.parse(value, true) : value;
	} catch {
		return false;
	}
	const rootPath = rootUri.path.endsWith('/') ? rootUri.path : `${rootUri.path}/`;
	return !(
		candidate.scheme !== rootUri.scheme
		|| candidate.authority !== rootUri.authority
		|| (candidate.path !== rootUri.path && !candidate.path.startsWith(rootPath))
	);
}