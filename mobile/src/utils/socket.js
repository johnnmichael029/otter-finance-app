/**
 * OTTER Socket.IO Client
 * Singleton socket instance — connect once, reuse everywhere.
 */
import { io } from 'socket.io-client';
import { API_BASE } from '../context/AuthContext';

// Derive socket URL from API_BASE (strip the /api suffix)
const SOCKET_URL = API_BASE.replace('/api', '');

let socket = null;

export const getSocket = () => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            transports: ['websocket'],
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        });
    }
    return socket;
};

export const connectSocket = (userId) => {
    const s = getSocket();
    if (!s.connected) {
        s.connect();
        s.once('connect', () => {
            s.emit('join_user_room', userId);
            console.log(`[SOCKET] Connected & joined room user:${userId}`);
        });
    } else {
        s.emit('join_user_room', userId);
    }
};

export const disconnectSocket = () => {
    if (socket?.connected) {
        socket.disconnect();
        console.log('[SOCKET] Disconnected');
    }
};
