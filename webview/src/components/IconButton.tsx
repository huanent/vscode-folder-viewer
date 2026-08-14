import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	icon: string;
	active?: boolean;
}

export function IconButton({ icon, active = false, className = '', ...props }: IconButtonProps) {
	return (
		<button
			className={`grid size-7 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent p-0 text-(--vscode-icon-foreground) hover:not-disabled:bg-(--vscode-toolbar-hoverBackground) focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-(--vscode-focusBorder) disabled:cursor-default disabled:opacity-40 ${active ? 'bg-(--vscode-toolbar-activeBackground,var(--vscode-toolbar-hoverBackground))' : ''} ${className}`}
			{...props}
		>
			<i className={`codicon ${icon}`} />
		</button>
	);
}