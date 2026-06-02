import type { InjectionKey } from 'vue';

export const BADGES_DRAWER_CLOSE: InjectionKey<() => Promise<void>> = Symbol('badges-drawer-close');
