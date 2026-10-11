import { create } from 'zustand';
import type { ConnectionState } from '@/types';

interface ConnectionStore extends ConnectionState {
  setStatus: (status: ConnectionState['status']) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  reconnectAttempts: 0,
  setStatus: (status) => set({ status }),
  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
}));
