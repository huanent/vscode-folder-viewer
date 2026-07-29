import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	icon: string;
	active?: boolean;
}

export function IconButton({ icon, active = false, className = '', ...props }: IconButtonProps) {
	return (
		<button
			className={`grid size-7 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent p-0 text-icon hover:not-disabled:bg-toolbar-hover focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:cursor-default disabled:opacity-40 ${active ? 'bg-toolbar-active' : ''} ${className}`}
			{...props}
		>
			<i className={`codicon ${icon}`} />
		</button>
	);
}