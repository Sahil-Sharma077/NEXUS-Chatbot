import React, { useState, useRef, useEffect } from 'react';
import { GroundingChunk } from '@google/genai';
import { ChatMessage as ChatMessageType, Role, Model } from '../types';
import { LogoIcon, UserIcon, BotIcon, SendIcon, MicIcon, StopIcon, SoundIcon, SearchIcon, MapIcon } from './Icons';

// --- Header Component ---
interface HeaderProps {
    currentModel: Model;
    setCurrentModel: (model: Model) => void;
}
export const Header: React.FC<HeaderProps> = ({ currentModel, setCurrentModel }) => {
    return (
        <header className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900 sticky top-0 z-10">
            <div className="flex items-center space-x-3">
                <LogoIcon className="h-8 w-8 text-purple-400" />
                <h1 className="text-xl font-bold text-gray-100">NEXUS</h1>
            </div>
            <div className="relative">
                <select 
                    value={currentModel}
                    onChange={(e) => setCurrentModel(e.target.value as Model)}
                    className="bg-gray-800 border border-gray-600 rounded-md py-2 pl-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                >
                    <option value={Model.PRO}>Gemini 2.5 Pro</option>
                    <option value={Model.FLASH}>Gemini 2.5 Flash</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
        </header>
    );
};

// --- Welcome Screen Component ---
export const WelcomeScreen: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
            <LogoIcon className="h-24 w-24 text-purple-500 mb-6" />
            <h2 className="text-3xl font-bold text-gray-100 mb-2">Welcome to NEXUS</h2>
            <p className="max-w-md">
                Start a conversation by typing below, or use the microphone for a real-time voice chat.
            </p>
        </div>
    );
};

// --- Chat Message Component ---
interface ChatMessageProps {
    message: ChatMessageType;
    onPlayTTS: (text: string) => void;
}
const GroundingInfo: React.FC<{ chunks?: GroundingChunk[] }> = ({ chunks }) => {
    if (!chunks || chunks.length === 0) return null;

    return (
        <div className="mt-3 border-t border-gray-600 pt-3">
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Sources:</h4>
            <div className="flex flex-wrap gap-2">
                {chunks.map((chunk, index) => {
                    const source = chunk.web || chunk.maps;
                    if (!source) return null;
                    return (
                        <a
                            key={index}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-gray-700 hover:bg-gray-600 text-blue-300 text-xs px-2 py-1 rounded-full transition-colors duration-200 truncate"
                            title={source.title}
                        >
                            {source.title}
                        </a>
                    );
                })}
            </div>
        </div>
    );
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onPlayTTS }) => {
    const isUser = message.role === Role.USER;
    const isSystem = message.role === 'system';

    if (isSystem) {
        return (
            <div className="text-center text-sm text-gray-500 italic my-2">
                {message.text}
            </div>
        );
    }
    
    return (
        <div className={`flex items-start gap-4 ${isUser ? 'justify-end' : ''}`}>
            {!isUser && <BotIcon className="h-8 w-8 flex-shrink-0 text-purple-400 bg-gray-700 rounded-full p-1" />}
            <div className={`max-w-xl rounded-xl px-4 py-3 ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                {!isUser && message.text && (
                    <div className="flex justify-end mt-2">
                        <button onClick={() => onPlayTTS(message.text)} className="text-gray-400 hover:text-white transition-colors">
                            <SoundIcon className="h-4 w-4" />
                        </button>
                    </div>
                )}
                {!isUser && <GroundingInfo chunks={message.groundingChunks} />}
            </div>
            {isUser && <UserIcon className="h-8 w-8 flex-shrink-0 text-blue-300 bg-gray-700 rounded-full p-1" />}
        </div>
    );
};

// --- Chat Input Component ---
interface ChatInputProps {
    onSendMessage: (input: string, useSearch: boolean, useMaps: boolean) => void;
    isLoading: boolean;
    isListening: boolean;
    onToggleListen: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSendMessage,
    isLoading,
    isListening,
    onToggleListen,
}) => {
    const [input, setInput] = useState('');
    const [useSearch, setUseSearch] = useState(false);
    const [useMaps, setUseMaps] = useState(false);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textAreaRef.current) {
            textAreaRef.current.style.height = 'auto';
            textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
        }
    }, [input]);

    const handleSend = () => {
        if (input.trim() && !isLoading && !isListening) {
            onSendMessage(input, useSearch, useMaps);
            setInput('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const GroundingButton: React.FC<{
        isActive: boolean;
        onClick: () => void;
        icon: React.ReactNode;
        label: string;
    }> = ({ isActive, onClick, icon, label }) => (
         <button
            onClick={onClick}
            className={`flex items-center space-x-1 px-2 py-1 text-xs rounded-full transition-colors ${
                isActive
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );

    return (
        <div className="space-y-3">
             <div className="flex items-center gap-2">
                <GroundingButton 
                    isActive={useSearch}
                    onClick={() => setUseSearch(!useSearch)}
                    icon={<SearchIcon className="h-3 w-3" />}
                    label="Search"
                />
                <GroundingButton
                    isActive={useMaps}
                    onClick={() => setUseMaps(!useMaps)}
                    icon={<MapIcon className="h-3 w-3" />}
                    label="Maps"
                />
            </div>
            <div className="flex items-end gap-2">
                <textarea
                    ref={textAreaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={isListening ? "Listening..." : "Type your message..."}
                    className="flex-1 bg-gray-700 text-gray-100 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-40"
                    rows={1}
                    disabled={isLoading || isListening}
                />
                <button
                    onClick={onToggleListen}
                    className={`p-3 rounded-full transition-colors ${
                        isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-purple-600 hover:bg-purple-700 text-white'
                    } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                    disabled={isLoading}
                >
                    {isListening ? <StopIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
                </button>
                <button
                    onClick={handleSend}
                    className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                    disabled={isLoading || isListening || !input.trim()}
                >
                    <SendIcon className="h-6 w-6" />
                </button>
            </div>
        </div>
    );
};