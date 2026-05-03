/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';

export type Vector3 = { x: number; y: number; z: number };

export interface Player {
  id: string;
  color: string;
  position: Vector3 | null;
}

export interface ForceField {
  id: string;
  position: Vector3;
  type: 'attractor' | 'repulsor';
  ownerId: string;
  createdAt: number;
  color: string;
}

interface GameState {
  myId: string | null;
  myColor: string | null;
  players: Record<string, Player>;
  forceFields: Record<string, ForceField>;
  ws: WebSocket | null;
  connect: () => void;
  disconnect: () => void;
  sendCursor: (position: Vector3) => void;
  addForce: (position: Vector3, type: 'attractor' | 'repulsor') => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  myId: null,
  myColor: null,
  players: {},
  forceFields: {},
  ws: null,

  connect: () => {
    const { ws: currentWs } = get();
    if (currentWs && (currentWs.readyState === WebSocket.CONNECTING || currentWs.readyState === WebSocket.OPEN)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'init') {
        set({ myId: data.id, myColor: data.color });
        const playersMap: Record<string, Player> = {};
        data.players.forEach((p: Player) => {
          if (p.id !== data.id) playersMap[p.id] = p;
        });
        
        const forcesMap: Record<string, ForceField> = {};
        data.forceFields.forEach((f: ForceField) => {
          forcesMap[f.id] = f;
        });
        
        set({ players: playersMap, forceFields: forcesMap });
      } else if (data.type === 'player_joined') {
        set((state) => ({
          players: { ...state.players, [data.player.id]: data.player }
        }));
      } else if (data.type === 'player_left') {
        set((state) => {
          const newPlayers = { ...state.players };
          delete newPlayers[data.id];
          return { players: newPlayers };
        });
      } else if (data.type === 'sync') {
        set((state) => {
          const newPlayers = { ...state.players };
          data.players.forEach((p: Player) => {
            if (p.id !== state.myId) {
              newPlayers[p.id] = { ...newPlayers[p.id], position: p.position };
            }
          });
          
          let newForces = state.forceFields;
          if (data.forceFields) {
            newForces = {};
            data.forceFields.forEach((f: ForceField) => {
              newForces[f.id] = f;
            });
          }
          
          return { players: newPlayers, forceFields: newForces };
        });
      } else if (data.type === 'force_added') {
        set((state) => ({
          forceFields: { ...state.forceFields, [data.force.id]: data.force }
        }));
      }
    };

    ws.onclose = () => {
      // Only auto-reconnect if we didn't intentionally disconnect
      const { ws: currentWs } = get();
      if (currentWs === ws) {
        setTimeout(() => get().connect(), 1000);
      }
    };

    set({ ws });
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, players: {}, forceFields: {} });
    }
  },

  sendCursor: (position: Vector3) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cursor', position }));
    }
  },

  addForce: (position: Vector3, type: 'attractor' | 'repulsor') => {
    const { ws, myColor } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'add_force', position, forceType: type, color: myColor }));
    }
  }
}));
