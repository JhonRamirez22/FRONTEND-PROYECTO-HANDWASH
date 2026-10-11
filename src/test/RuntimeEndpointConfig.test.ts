import { describe, expect, it } from 'vitest';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';

describe('RuntimeEndpointConfig', () => {
  it('keeps camera video on the local MJPEG service unless explicitly configured', () => {
    expect(RuntimeEndpointConfig.cameraStreamUrl()).toBe(
      import.meta.env.VITE_CAMERA_STREAM_URL?.trim().replace(/\/+$/, '')
      || 'http://127.0.0.1:8091/video.mjpg',
    );
  });

  it('uses the same origin for the packaged dashboard and derives its WebSocket scheme', () => {
    if (import.meta.env.DEV) return;
    expect(RuntimeEndpointConfig.apiBaseUrl()).toBe(window.location.origin);
    const socket = new URL(RuntimeEndpointConfig.websocketBaseUrl());
    expect(socket.host).toBe(window.location.host);
    expect(['ws:', 'wss:']).toContain(socket.protocol);
  });
});
