import { useEffect, useState } from 'react';
import type { SpreadsheetSheet } from '../../../src/spreadsheet';

interface SpreadsheetPreviewProps {
	name: string;
	sheets: SpreadsheetSheet[];
}

export function SpreadsheetPreview({ name, sheets }: SpreadsheetPreviewProps) {
	const [activeSheetIndex, setActiveSheetIndex] = useState(0);

	useEffect(() => setActiveSheetIndex(0), [sheets]);
	const sheet = sheets[activeSheetIndex];
	const truncated = sheet && sheet.columnCount > (sheet.rows[0]?.length ?? 0);

	return (
		<main className="flex h-full select-text flex-col overflow-hidden bg-(--vscode-editor-background)" aria-labelledby="spreadsheet-preview-title">
				<header className="flex h-11 shrink-0 items-center gap-2 border-b border-(--vscode-panel-border) px-3">
					<i className="codicon codicon-table text-base text-(--vscode-icon-foreground)" aria-hidden="true" />
					<div className="flex min-w-0 flex-1 items-baseline gap-2">
						<h1 id="spreadsheet-preview-title" className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold">{name}</h1>
						{sheet && <span className="shrink-0 text-xs text-(--vscode-descriptionForeground)">{sheet.rowCount} rows, {sheet.columnCount} columns{truncated ? ' (preview truncated)' : ''}</span>}
					</div>
				</header>
				{sheets.length > 1 && <div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-(--vscode-panel-border) px-2" role="tablist" aria-label="Worksheets">
					{sheets.map((item, index) => <button key={`${item.name}-${index}`} type="button" role="tab" aria-selected={index === activeSheetIndex} className={`h-8 shrink-0 cursor-pointer border-0 border-b-2 bg-transparent px-3 text-sm ${index === activeSheetIndex ? 'border-(--vscode-focusBorder) text-(--vscode-foreground)' : 'border-transparent text-(--vscode-descriptionForeground) hover:text-(--vscode-foreground)'}`} onClick={() => setActiveSheetIndex(index)}>{item.name}</button>)}
				</div>}
				<div className="min-h-0 flex-1 overflow-auto">
					{sheet?.rows.length
							? <SpreadsheetTable rows={sheet.rows} />
							: <div className="grid h-full place-items-center text-(--vscode-descriptionForeground)">This spreadsheet is empty.</div>}
				</div>
		</main>
	);
}

function SpreadsheetTable({ rows }: { rows: string[][] }) {
	const columnCount = Math.max(0, ...rows.map(row => row.length));
	return <table className="border-separate border-spacing-0 text-xs">
		<thead className="sticky top-0 z-2">
			<tr><th className="sticky left-0 z-3 h-7 min-w-12 border-r border-b border-(--vscode-panel-border) bg-(--vscode-sideBar-background)" />{Array.from({ length: columnCount }, (_, index) => <th key={index} className="h-7 min-w-28 max-w-80 border-r border-b border-(--vscode-panel-border) bg-(--vscode-sideBar-background) px-2 text-center font-normal text-(--vscode-descriptionForeground)">{getColumnName(index)}</th>)}</tr>
		</thead>
		<tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
			<th className="sticky left-0 z-1 h-7 min-w-12 border-r border-b border-(--vscode-panel-border) bg-(--vscode-sideBar-background) px-2 text-right font-normal text-(--vscode-descriptionForeground)">{rowIndex + 1}</th>
			{Array.from({ length: columnCount }, (_, columnIndex) => <td key={columnIndex} className="h-7 min-w-28 max-w-80 overflow-hidden border-r border-b border-(--vscode-panel-border) px-2 text-ellipsis whitespace-nowrap" title={row[columnIndex] ?? ''}>{row[columnIndex] ?? ''}</td>)}
		</tr>)}</tbody>
	</table>;
}

function getColumnName(index: number): string {
	let name = '';
	for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
		name = String.fromCharCode(65 + (value - 1) % 26) + name;
	}
	return name;
}