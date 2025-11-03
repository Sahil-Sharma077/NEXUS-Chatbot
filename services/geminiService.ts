import { GoogleGenAI, Modality } from '@google/genai';
// Fix: Import LiveConnection instead of the deprecated LiveSession.
// Fix: The 'LiveConnection' type is not exported by '@google/genai'.
import type { LiveServerMessage } from '@google/genai';

if (!process.env.API_KEY) {
    throw new Error("API key not found. Please set the API_KEY environment variable.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSpeech = async (text: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        throw new Error("No audio data received from API.");
    }
    return audioData;
};

// Fix: Use lowercase event handlers (onopen, onmessage, etc.) to match the SDK's expected callback interface.
interface LiveCallbacks {
    onopen: () => void;
    onmessage: (message: LiveServerMessage) => void;
    onerror: (e: ErrorEvent) => void;
    onclose: (e: CloseEvent) => void;
}

// Fix: The connect method returns a Promise resolving to a LiveConnection object.
// Fix: Removed explicit return type to allow for type inference, as `LiveConnection` is not an exported type.
export const connectToLive = (callbacks: LiveCallbacks) => {
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
        },
    });
};