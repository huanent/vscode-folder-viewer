import { Workbook, type Cell } from 'exceljs';
import { Readable } from 'stream';
import * as vscode from 'vscode';

const maxPreviewColumns = 100;

export interface SpreadsheetSheet {
	name: string;
	rows: string[][];
	rowCount: number;
	columnCount: number;
}

export async function readSpreadsheet(uri: vscode.Uri): Promise<SpreadsheetSheet[]> {
	const data = await vscode.workspace.fs.readFile(uri);
	const workbook = new Workbook();
	if (uri.path.toLowerCase().endsWith('.csv')) {
		await workbook.csv.read(Readable.from([data]));
	} else {
		const buffer = Buffer.from(data) as unknown as Parameters<typeof workbook.xlsx.load>[0];
		await workbook.xlsx.load(buffer);
	}

	return workbook.worksheets.map(worksheet => {
		const rowCount = worksheet.rowCount;
		const columnCount = worksheet.columnCount;
		const rows: string[][] = [];
		const previewColumnCount = Math.min(columnCount, maxPreviewColumns);
		for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
			const row: string[] = [];
			for (let columnNumber = 1; columnNumber <= previewColumnCount; columnNumber += 1) {
				row.push(formatCell(worksheet.getRow(rowNumber).getCell(columnNumber)));
			}
			rows.push(row);
		}
		return { name: worksheet.name, rows, rowCount, columnCount };
	});
}

function formatCell(cell: Cell): string {
	if (cell.value instanceof Date) return cell.value.toLocaleString();
	return cell.text;
}