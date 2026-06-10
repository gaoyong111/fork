/**
 * appSettingsStore - 应用偏好（自动精读、默认摘要模式）
 */

import { create } from 'zustand';
import type { AppPreferences, SummaryMode } from '../types';
import * as api from '../services/api';

const DEFAULT_PREFERENCES: AppPreferences = {
    autoDeepRead: true,
    defaultSummaryMode: 'detailed',
};

export interface AppSettingsState {
    preferences: AppPreferences;
    loaded: boolean;
    load: () => Promise<void>;
    save: (partial: Partial<AppPreferences>) => Promise<void>;
    getDefaultSummaryMode: () => SummaryMode;
    isAutoDeepReadEnabled: () => boolean;
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
    preferences: DEFAULT_PREFERENCES,
    loaded: false,

    load: async () => {
        try {
            const prefs = await api.getAppPreferences();
            set({
                preferences: {
                    ...DEFAULT_PREFERENCES,
                    ...prefs,
                    defaultSummaryMode: prefs.defaultSummaryMode === 'brief' ? 'brief' : 'detailed',
                },
                loaded: true,
            });
        } catch (err) {
            console.error('加载应用偏好失败:', err);
            set({ loaded: true });
        }
    },

    save: async (partial) => {
        const next: AppPreferences = {
            ...get().preferences,
            ...partial,
            defaultSummaryMode:
                (partial.defaultSummaryMode ?? get().preferences.defaultSummaryMode) === 'brief'
                    ? 'brief'
                    : 'detailed',
        };
        const saved = await api.setAppPreferences(next);
        set({
            preferences: {
                ...DEFAULT_PREFERENCES,
                ...saved,
                defaultSummaryMode: saved.defaultSummaryMode === 'brief' ? 'brief' : 'detailed',
            },
        });
    },

    getDefaultSummaryMode: () => get().preferences.defaultSummaryMode,

    isAutoDeepReadEnabled: () => get().preferences.autoDeepRead,
}));
