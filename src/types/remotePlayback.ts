// src/types/remotePlayback.ts

export type RemotePlaybackCommand = 'play' | 'pause' | 'seek' | 'volume';
export interface RemotePlaybackSnapshot {
    mediaId: string | null;
    catalogMediaId?: string | null;
    position: number;
    duration: number;
    playing: boolean;
}
export interface RemotePlaybackBackend {
    start(mediaId: string): Promise<void>;
    command(command: RemotePlaybackCommand, value?: number): Promise<void>;
    snapshot(): Promise<RemotePlaybackSnapshot>;
}
