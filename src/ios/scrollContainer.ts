import React from 'react';

/**
 * The scroll container of the screen a component is rendered in. <Stack>
 * provides each layer's element; <NavBar> uses it when no `scrollRef` is
 * passed (falling back to the window outside a stack).
 */
export const ScrollContainerContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);
