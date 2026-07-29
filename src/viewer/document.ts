import * as vscode from 'vscode';
import { ViewerViewState } from '../webview';

export class ViewerDocument implements vscode.CustomDocument {
	latestViewState: ViewerViewState;

	constructor(readonly uri: vscode.Uri, readonly rootUri: vscode.Uri) {
		this.latestViewState = {
			currentUri: rootUri.toString(),
			history: []
		};
	}

	dispose(): void { }
}