import type { InjectionKey } from 'vue';

export const BADGES_DRAWER_CLOSE: InjectionKey<() => void> = Symbol('badges-drawer-close');
