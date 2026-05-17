'use client';

import {
  createElement,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementType,
} from 'react';

type MotionExtra = {
  initial?: unknown;
  animate?: unknown;
  whileInView?: unknown;
  viewport?: unknown;
  transition?: unknown;
};

type MotionProps<T extends ElementType> = ComponentPropsWithoutRef<T> & MotionExtra;

function createMotionComponent<T extends ElementType>(tag: T) {
  const Comp = forwardRef<HTMLElement, MotionProps<T>>(function MotionEl(
    { initial: _i, animate: _a, whileInView: _w, viewport: _v, transition: _t, ...rest },
    ref
  ) {
    return createElement(tag, { ref, ...rest });
  });
  Comp.displayName = `motion.${String(tag)}`;
  return Comp;
}

const cache = new Map<string, ReturnType<typeof createMotionComponent>>();

/** Lightweight stand-in when `motion` is not installed. Run `npm i motion` for full animations. */
export const motion = new Proxy({} as Record<string, ReturnType<typeof createMotionComponent>>, {
  get(_target, prop: string) {
    if (!cache.has(prop)) {
      cache.set(prop, createMotionComponent(prop as ElementType));
    }
    return cache.get(prop)!;
  },
});
