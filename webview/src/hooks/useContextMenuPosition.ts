import { useLayoutEffect, useRef, useState } from 'react';

const viewportPadding = 8;

export function useContextMenuPosition(x: number, y: number) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left: x, top: y });

	useLayoutEffect(() => {
		const updatePosition = () => {
			const menu = menuRef.current;
			if (!menu) return;
			setPosition({
				left: Math.max(viewportPadding, Math.min(x, window.innerWidth - menu.offsetWidth - viewportPadding)),
				top: Math.max(viewportPadding, Math.min(y, window.innerHeight - menu.offsetHeight - viewportPadding))
			});
		};

		updatePosition();
		window.addEventListener('resize', updatePosition);
		return () => window.removeEventListener('resize', updatePosition);
	}, [x, y]);

	return { menuRef, position };
}