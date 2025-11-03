import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
// Fix: Import LiveConnection instead of the deprecated LiveSession.
// Fix: The 'LiveConnection' type is not exported by '@google/genai'. It will be inferred from the `connectToLive` service function.
import type { Chat, GroundingChunk } from '@google/genai';
import { ChatMessage, ChatInput, WelcomeScreen, Header } from './components/Layout';
import { generateSpeech, connectToLive } from './services/geminiService';
import { ChatMessage as ChatMessageType, Model, Role } from './types';
// Fix: Import new utility functions for audio processing.
import { decode, createBlob, decodeAudioData } from './utils/audio';

// Fix: Infer the LiveConnection type from the return value of connectToLive for type safety, as it's not exported from the SDK.
type LiveConnection = Awaited<ReturnType<typeof connectToLive>>;

const App: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessageType[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [chat, setChat] = useState<Chat | null>(null);
    const [currentModel, setCurrentModel] = useState<Model>(Model.FLASH);
    
    // Fix: Use LiveConnection type for the session ref.
    const liveSessionRef = useRef<LiveConnection | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef(0);
    const audioPlaybackSources = useRef(new Set<AudioBufferSourceNode>());

    const initializeChat = useCallback((model: Model) => {
        if (!process.env.API_KEY) {
            alert("API key not found. Please set the API_KEY environment variable.");
            return;
        }
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const newChat = ai.chats.create({ model });
        setChat(newChat);
    }, []);

    useEffect(() => {
        initializeChat(currentModel);
    }, [currentModel, initializeChat]);

    const handleSendMessage = async (
        input: string,
        useSearch: boolean,
        useMaps: boolean
    ) => {
        if (!input.trim() || !chat) return;

        setIsLoading(true);
        const userMessage: ChatMessageType = {
            id: Date.now(),
            role: Role.USER,
            text: input,
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const tools: any[] = [];
            if (useSearch) tools.push({ googleSearch: {} });
            if (useMaps) tools.push({ googleMaps: {} });
            
            let toolConfig: any = {};
            if (useMaps) {
                try {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject);
                    });
                    toolConfig.retrievalConfig = {
                        latLng: {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        }
                    };
                } catch (error) {
                    console.error("Geolocation failed:", error);
                    // Add a message to inform the user about the geolocation failure.
                    const errorMessage: ChatMessageType = {
                        id: Date.now() + 1,
                        role: Role.MODEL,
                        text: "Could not get your location for Maps search. Please ensure you have granted location permissions.",
                    };
                    setMessages(prev => [...prev, errorMessage]);
                }
            }

            const response = await ai.models.generateContent({
                model: currentModel,
                contents: [{ parts: [{ text: input }] }],
                config: tools.length > 0 ? { tools } : {},
                ...(Object.keys(toolConfig).length > 0 && { toolConfig }),
            });

            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            
            const botMessage: ChatMessageType = {
                id: Date.now() + 1,
                role: Role.MODEL,
                text: response.text,
                groundingChunks: groundingChunks as GroundingChunk[] || undefined
            };
            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            console.error(error);
            const errorMessage: ChatMessageType = {
                id: Date.now() + 1,
                role: Role.MODEL,
                text: "Sorry, something went wrong. Please try again.",
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlayTTS = async (text: string) => {
        setIsLoading(true);
        try {
            const audioData = await generateSpeech(text);
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
            const decodedData = decode(audioData);

            // Fix: Use the decodeAudioData utility for cleaner audio processing.
            const buffer = await decodeAudioData(decodedData, audioContext, 24000, 1);

            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (error) {
            console.error("TTS Error:", error);
            alert("Failed to generate speech.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const stopListening = useCallback(() => {
        if (liveSessionRef.current) {
            liveSessionRef.current.close();
            liveSessionRef.current = null;
        }
        if (audioSourceRef.current) {
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (audioProcessorRef.current) {
            audioProcessorRef.current.disconnect();
            audioProcessorRef.current.onaudioprocess = null;
            audioProcessorRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }
        audioPlaybackSources.current.forEach(source => source.stop());
        audioPlaybackSources.current.clear();
        setIsListening(false);
    }, []);

    const handleToggleListen = async () => {
        if (isListening) {
            stopListening();
            return;
        }

        setIsListening(true);
        setMessages(prev => [...prev, { id: Date.now(), role: 'system', text: 'Voice mode activated...' }]);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            nextStartTimeRef.current = 0;

            let currentInputTranscription = '';
            let currentOutputTranscription = '';

            // Fix: Use lowercase event handlers to match the SDK's expected callback interface.
            const sessionPromise = connectToLive({
                onopen: () => {
                    audioSourceRef.current = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    audioProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);

                    audioProcessorRef.current.onaudioprocess = (event) => {
                        const inputData = event.inputBuffer.getChannelData(0);
                        // Fix: Use createBlob utility for cleaner audio encoding.
                        const pcmBlob = createBlob(inputData);
                        sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    };
                    
                    audioSourceRef.current.connect(audioProcessorRef.current);
                    audioProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message) => {
                   if (message.serverContent?.inputTranscription) {
                        currentInputTranscription += message.serverContent.inputTranscription.text;
                   }
                   if (message.serverContent?.outputTranscription) {
                        currentOutputTranscription += message.serverContent.outputTranscription.text;
                   }
                   if (message.serverContent?.turnComplete) {
                        const fullInputTranscription = currentInputTranscription;
                        const fullOutputTranscription = currentOutputTranscription;
                        if (fullInputTranscription) {
                           setMessages(prev => [...prev, {id: Date.now(), role: Role.USER, text: fullInputTranscription}]);
                        }
                        if (fullOutputTranscription) {
                           setMessages(prev => [...prev, {id: Date.now()+1, role: Role.MODEL, text: fullOutputTranscription}]);
                        }
                        currentInputTranscription = '';
                        currentOutputTranscription = '';
                   }
                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audioData) {
                        const outputAudioContext = outputAudioContextRef.current!;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);

                        const decodedData = decode(audioData);
                        // Fix: Use the decodeAudioData utility for cleaner audio processing.
                        const buffer = await decodeAudioData(decodedData, outputAudioContext, 24000, 1);

                        const source = outputAudioContext.createBufferSource();
                        source.buffer = buffer;
                        source.connect(outputAudioContext.destination);
                        source.addEventListener('ended', () => {
                            audioPlaybackSources.current.delete(source);
                        });
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += buffer.duration;
                        audioPlaybackSources.current.add(source);
                    }
                },
                onerror: (e) => {
                    console.error("Live session error:", e);
                    setMessages(prev => [...prev, { id: Date.now(), role: 'system', text: 'Voice connection error. Please try again.' }]);
                    stopListening();
                },
                onclose: () => {
                    console.log("Live session closed.");
                    stream.getTracks().forEach(track => track.stop());
                }
            });
            
            liveSessionRef.current = await sessionPromise;

        } catch (error) {
            console.error("Failed to start listening:", error);
            setMessages(prev => [...prev, { id: Date.now(), role: 'system', text: 'Could not access microphone. Please grant permission.' }]);
            stopListening();
        }
    };
    
    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
            <Header currentModel={currentModel} setCurrentModel={setCurrentModel} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {messages.length === 0 ? (
                    <WelcomeScreen />
                ) : (
                    messages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} onPlayTTS={handlePlayTTS} />
                    ))
                )}
                {isLoading && (
                    <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                    </div>
                )}
            </main>
            <footer className="bg-gray-800/50 backdrop-blur-sm border-t border-gray-700 p-4 sticky bottom-0">
                <ChatInput
                    onSendMessage={handleSendMessage}
                    isLoading={isLoading}
                    isListening={isListening}
                    onToggleListen={handleToggleListen}
                />
            </footer>
        </div>
    );
};

export default App;