import type { GroundingChunk } from '@google/genai';

export enum Role {
    USER = 'user',
    MODEL = 'model',
}

export interface ChatMessage {
    id: number;
    role: Role | 'system';
    text: string;
    groundingChunks?: GroundingChunk[];
}

export enum Model {
    PRO = 'gemini-2.5-pro',
    FLASH = 'gemini-2.5-flash'
}
