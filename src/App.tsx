/// <reference types="vite/client" />

import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Mic, MicOff, Volume2, BookOpen, Clock, AlertCircle, Bluetooth, BluetoothConnected, X, Loader2, Send, ArrowLeft, Cpu } from "lucide-react";
import { ref, set, serverTimestamp } from "firebase/database";
import { rtdb } from "./firebase";
import ESP32GuideModal from "./ESP32GuideModal";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyBynSGuocCzlhzZwBdCDIubEwo45Y67vus" || process.env.GEMINI_API_KEY || "" });

const textToBraille = (text: string) => {
  const brailleMap: Record<string, string> = {
    a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
    k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
    u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",
    " ": " ", ",": "⠂", ";": "⠆", ":": "⠒", ".": "⠲", "!": "⠖", "?": "⠦",
    "1": "⠼⠁", "2": "⠼⠃", "3": "⠼⠉", "4": "⠼⠙", "5": "⠼⠑",
    "6": "⠼⠋", "7": "⠼⠛", "8": "⠼⠓", "9": "⠼⠊", "0": "⠼⠚"
  };
  return text.toLowerCase().split('').map(char => brailleMap[char] || char).join('');
};

function BrailleChat({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<{id: string, role: 'user'|'model', text: string, highlightIndex?: number}[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    const userMsgId = Date.now().toString() + "-user";
    setMessages(prev => [...prev, {id: userMsgId, role: 'user', text: userText}]);
    setIsLoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          ...messages.map(m => ({
            role: m.role,
            parts: [{text: m.text}]
          })),
          { role: "user", parts: [{ text: userText }] }
        ],
        config: {
          systemInstruction: "You are a helpful assistant talking to a visually impaired student using a Braille display. Keep your answers brief, clear, and direct. Do not use complex formatting (like markdown) that is hard to read in Braille."
        }
      });
      
      const modelText = response.text || "I didn't quite get that.";
      const modelMsgId = Date.now().toString() + "-model";
      setMessages(prev => [...prev, {id: modelMsgId, role: 'model', text: modelText, highlightIndex: 0}]);

      // Stream to Firebase in chunks of 2 characters every 2 seconds
      const streamToFirebase = async () => {
        for (let i = 0; i < modelText.length; i += 2) {
          setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, highlightIndex: i } : m));
          
          const textChunk = modelText.substring(i, i + 2);
          const brailleChunk = textToBraille(textChunk);
          
          try {
            await set(ref(rtdb, "braille_stream/current"), {
              text: textChunk,
              braille: brailleChunk,
              createdAt: serverTimestamp()
            });
          } catch (error) {
            console.error("Failed to stream to RTDB", error);
          }

          // Wait 2 seconds before sending next chunk
          if (i + 2 < modelText.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
            setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, highlightIndex: -1 } : m));
            
            // Optionally clear the braille display after streaming finishes
            try {
               await set(ref(rtdb, "braille_stream/current"), {
                 text: "",
                 braille: "",
                 createdAt: serverTimestamp()
               });
            } catch (error) {
               console.error("Failed to clear stream", error);
            }
          }
        }
      };
      
      // Start stream in background
      streamToFirebase();

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {id: Date.now().toString() + "-error", role: 'model', text: "Error connecting to AI. Please check your connection."}]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-100 selection:text-zinc-950">
      <header className="flex items-center justify-between px-6 py-4 md:px-10 md:py-6 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 md:p-3 rounded-full hover:bg-zinc-800 transition-colors outline-none focus:ring-2 focus:ring-white flex items-center justify-center"
            aria-label="Disconnect and go back"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-lg md:text-2xl font-semibold tracking-tight">Braille Assist</h2>
            <p className="text-xs md:text-sm text-zinc-400 font-medium">Device connected</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-zinc-800/80 border border-zinc-700 text-xs md:text-sm font-medium text-emerald-400">
           <BluetoothConnected size={16} />
           <span className="hidden md:inline">Synced</span>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto w-full mx-auto p-4 md:p-8 space-y-6 md:space-y-10 min-h-0">
        <div className="max-w-4xl mx-auto space-y-6 md:space-y-10 w-full">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 text-center opacity-60">
              <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                 <BluetoothConnected size={40} className="text-zinc-500" />
              </div>
              <p className="text-xl md:text-2xl font-semibold tracking-tight">Seamless Braille Chat</p>
              <p className="text-sm md:text-base mt-2 max-w-sm">Type text here to simulate input from your refreshable Braille display.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
               <div className="max-w-[90%] md:max-w-[80%]">
                 <div className={`p-4 md:p-6 rounded-3xl shadow-sm ${msg.role === 'user' ? 'bg-zinc-100 text-zinc-950 rounded-br-sm' : 'bg-zinc-900 text-zinc-100 rounded-bl-sm border border-zinc-800'}`}>
                   <p className="text-lg md:text-xl font-medium leading-relaxed">{msg.text}</p>
                   <div className={`border-t pt-5 mt-4 flex flex-wrap gap-1.5 ${msg.role === 'user' ? 'border-zinc-300' : 'border-zinc-800'}`}>
                     {textToBraille(msg.text).split('').map((char, index) => {
                       const isHighlighted = msg.role === 'model' && msg.highlightIndex !== undefined && msg.highlightIndex !== -1 && index >= msg.highlightIndex && index < msg.highlightIndex + 2;
                       
                       return (
                         <span 
                           key={index} 
                           className={`flex items-center justify-center w-8 h-10 md:w-10 md:h-12 text-2xl md:text-3xl font-mono rounded-lg border shadow-sm transition-all hover:scale-105 ${
                             msg.role === 'user' 
                               ? 'bg-zinc-200 border-zinc-300 text-zinc-900' 
                               : isHighlighted
                                 ? 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/20'
                                 : 'bg-zinc-800 border-zinc-700 text-zinc-100'
                           }`}
                           aria-hidden="true"
                         >
                           {char}
                         </span>
                       );
                     })}
                   </div>
                 </div>
                 <p className={`text-[10px] md:text-xs font-semibold mt-2 opacity-50 uppercase tracking-widest ${msg.role === 'user' ? 'text-right pr-2' : 'text-left pl-2'}`}>
                   {msg.role === 'user' ? 'Braille Input' : 'AI Output'}
                 </p>
               </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex flex-col items-start w-full">
               <div className="max-w-[85%] md:max-w-[75%]">
                 <div className="p-4 md:p-6 rounded-3xl bg-zinc-900 text-zinc-100 rounded-bl-sm border border-zinc-800 flex items-center gap-3">
                   <Loader2 className="animate-spin w-5 h-5 text-zinc-400" />
                   <span className="text-zinc-400 font-medium tracking-tight">Translating...</span>
                 </div>
               </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      <footer className="w-full bg-zinc-950/80 backdrop-blur-md border-t border-zinc-900 p-4 md:p-6 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-full py-3 pl-6 pr-14 text-base md:text-lg focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent placeholder:text-zinc-600 transition-all shadow-sm"
              placeholder="Type your message..."
              disabled={isLoading}
              autoFocus
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="absolute right-1.5 p-2.5 bg-zinc-100 text-zinc-950 rounded-full disabled:opacity-50 hover:bg-white hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-zinc-100 disabled:hover:scale-100"
            >
              <Send size={20} className="ml-0.5" />
            </button>
          </form>
          <p className="text-center text-xs font-medium text-zinc-600 mt-3 hidden md:block">Prototype Mode / Braille Translation active</p>
        </div>
      </footer>
    </div>
  );
}

const studentData = {
  name: "Naathiq",
  date: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  todayClasses: [
    { time: "09:00 AM", subject: "Mathematics", room: "101" },
    { time: "11:00 AM", subject: "History", room: "204" },
    { time: "01:30 PM", subject: "Biology", room: "Lab 3" },
  ],
  assignments: [
    { subject: "History", task: "Read chapter 4", due: "Tomorrow" },
    { subject: "Mathematics", task: "Problem set 5", due: "Friday" },
  ],
  announcements: [
    "School assembly at 10 AM on Friday.",
    "Library will be closed for maintenance next Monday.",
  ],
};

export default function App() {
  const [currentView, setCurrentView] = useState<"dashboard" | "braille_chat">("dashboard");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [listeningLanguage, setListeningLanguage] = useState<"en-US" | "ta-IN">("en-US");
  const [showBrailleModal, setShowBrailleModal] = useState(false);
  const [showESP32Modal, setShowESP32Modal] = useState(false);
  const [brailleStatus, setBrailleStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");

  const connectBraille = () => {
    setBrailleStatus("scanning");
    setTimeout(() => {
      setBrailleStatus("connected");
      setTimeout(() => {
        setShowBrailleModal(false);
        setCurrentView("braille_chat");
      }, 1500);
    }, 2000);
  };

  const dashboardContext = useMemo(() => {
    return JSON.stringify({
      student_info: { name: studentData.name },
      today_classes: studentData.todayClasses,
      announcements: studentData.announcements
    });
  }, []);
  
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  const stopLiveConversation = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (liveSessionRef.current) {
      liveSessionRef.current.then((session: any) => session.close()).catch(console.error);
      liveSessionRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const startLiveConversation = useCallback(async () => {
    if (liveSessionRef.current) return;
    
    try {
      setIsListening(true);
      setAiResponse("Connecting to AI...");
      setTranscript("");
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass({ sampleRate: 16000 }) as AudioContext;
      }
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') await audioContext.resume();
      
      nextPlayTimeRef.current = audioContext.currentTime;

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: listeningLanguage === "ta-IN" ? "Kore" : "Puck" } },
          },
          systemInstruction: `You are a helpful and concise AI assistant for a visually impaired student named ${studentData.name}. Answer based on: ${dashboardContext}. Give short, direct responses. ${listeningLanguage === "ta-IN" ? "IMPORTANT: Speak ONLY in Tamil, translating all data." : ""}`,
        },
        callbacks: {
          onopen: async () => {
            setAiResponse("Listening! Say something...");
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true } 
              });
              streamRef.current = stream;
              
              const source = audioContext.createMediaStreamSource(stream);
              const processor = audioContext.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = processor;
              
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  let s = Math.max(-1, Math.min(1, inputData[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                const binary = String.fromCharCode(...new Uint8Array(pcm16.buffer));
                const base64Data = window.btoa(binary);

                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                });
              };
              
              source.connect(processor);
              processor.connect(audioContext.destination);
              
            } catch (err) {
              console.error("Mic error:", err);
              setAiResponse("Mic access denied or error.");
              stopLiveConversation();
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              const parts = message.serverContent.modelTurn.parts;
              for (const part of parts) {
                  if (part.text) {
                     setAiResponse((prev) => {
                         const base = prev === "Listening! Say something..." || prev === "Connecting to AI..." ? "" : prev;
                         return base + part.text;
                     });
                  }
                  
                  if (part.inlineData && part.inlineData.data) {
                    setIsSpeaking(true);
                    isPlayingRef.current = true;
                    
                    const base64Audio = part.inlineData.data;
                    const binaryString = atob(base64Audio);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    const int16Array = new Int16Array(bytes.buffer);
                    const outBuffer = audioContext.createBuffer(1, int16Array.length, 24000);
                    const channelData = outBuffer.getChannelData(0);
                    for (let i = 0; i < int16Array.length; i++) {
                      channelData[i] = int16Array[i] / 32768.0;
                    }
                    
                    const playSource = audioContext.createBufferSource();
                    playSource.buffer = outBuffer;
                    playSource.connect(audioContext.destination);
                    
                    const currentTime = audioContext.currentTime;
                    if (nextPlayTimeRef.current < currentTime) {
                      nextPlayTimeRef.current = currentTime;
                    }
                    
                    playSource.start(nextPlayTimeRef.current);
                    nextPlayTimeRef.current += outBuffer.duration;
                    
                    playSource.onended = () => {
                      if (audioContext.currentTime >= nextPlayTimeRef.current - 0.1) {
                         setIsSpeaking(false);
                         isPlayingRef.current = false;
                      }
                    };
                  }
              }
            }
            if (message.serverContent?.interrupted) {
               nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
            }
          },
          onerror: (err) => {
            console.error("Live API error:", err);
            setAiResponse("Live connection error.");
            stopLiveConversation();
          },
          onclose: () => {
            console.log("Live API connection closed.");
            stopLiveConversation();
          }
        }
      });
      liveSessionRef.current = sessionPromise;

    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  }, [listeningLanguage, stopLiveConversation]);

  const toggleLanguage = useCallback(() => {
    setListeningLanguage(prev => prev === "en-US" ? "ta-IN" : "en-US");
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopLiveConversation();
    } else {
      startLiveConversation();
    }
  }, [isListening, startLiveConversation, stopLiveConversation]);

  const stopSpeaking = stopLiveConversation;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isListening && !isSpeaking) {
        e.preventDefault();
        startLiveConversation();
      } else if (e.code === "KeyL") {
        e.preventDefault();
        toggleLanguage();
      }
    };

    const timer = setInterval(() => setCurrentTime(new Date()), 60000);

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearInterval(timer);
    };
  }, [isListening, isSpeaking, toggleLanguage, startLiveConversation]);

  if (currentView === "braille_chat") {
    return <BrailleChat onBack={() => {
      setCurrentView("dashboard");
      setBrailleStatus("disconnected");
    }} />;
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden font-sans border-[12px] md:border-[16px] border-white p-6 md:p-12 flex flex-col selection:bg-white selection:text-black">
      <header className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12">
        <div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none text-white uppercase break-words hyphens-none" tabIndex={0}>
            Hello,<br />{studentData.name}
          </h1>
          <p className="text-2xl md:text-4xl font-bold mt-4 opacity-80" tabIndex={0}>{studentData.date}</p>
        </div>
        <div className="mt-8 md:mt-0 text-left md:text-right" aria-live="polite">
          <div className="text-7xl md:text-9xl font-black text-white" aria-hidden="true">
             {currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
          <div className="text-xl md:text-3xl font-bold uppercase tracking-widest mt-2 flex flex-col md:items-end gap-4">
            <div>
              {currentTime.getHours() < 12 ? 'Morning' : (currentTime.getHours() < 17 ? 'Afternoon' : 'Evening')} Session
            </div>
            <button 
              onClick={() => setShowBrailleModal(true)}
              className="bg-zinc-800 text-white border-2 md:border-4 border-white px-4 py-2 md:px-6 md:py-3 font-bold uppercase tracking-tighter hover:bg-white hover:text-black transition-colors focus:ring-4 focus:ring-white outline-none flex items-center gap-3 w-full justify-center md:justify-end"
              aria-label={brailleStatus === 'connected' ? "Braille display and keyboard connected" : "Connect Braille display and keyboard"}
            >
              {brailleStatus === 'connected' ? <BluetoothConnected size={24} /> : <Bluetooth size={24} />}
              {brailleStatus === 'connected' ? 'Braille Connected' : 'Connect Braille'}
            </button>
          </div>
          {isSpeaking && (
             <button
               onClick={stopSpeaking}
               className="mt-6 bg-red-600 text-white px-6 py-3 text-2xl md:text-3xl font-black uppercase tracking-tighter border-4 border-red-600 hover:bg-black hover:text-red-500 transition-colors w-full md:w-auto outline-none focus:ring-8 focus:ring-white"
               aria-label="Stop speaking audio"
             >
               Stop Audio
             </button>
          )}
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center relative py-12 md:py-24">
        {/* Core Listening Interface */}
        <div className="absolute inset-x-0 top-12 md:top-24 flex items-center justify-center pointer-events-none">
          <div className={`w-[300px] h-[300px] md:w-[500px] md:h-[500px] border-[16px] md:border-[24px] rounded-full flex items-center justify-center transition-all duration-500 ${isListening ? 'border-white/20 scale-110' : 'border-zinc-900 border-opacity-50'}`}>
            <div className={`w-[240px] h-[240px] md:w-[400px] md:h-[400px] border-[16px] md:border-[24px] rounded-full flex items-center justify-center transition-all duration-500 delay-75 ${isListening ? 'border-white/40 scale-105' : 'border-zinc-800 border-opacity-50'}`}>
               <button
                 onClick={toggleVoice}
                 className={`w-[180px] h-[180px] md:w-[300px] md:h-[300px] rounded-full flex flex-col items-center justify-center transition-all duration-300 pointer-events-auto outline-none focus:ring-8 focus:ring-white ${
                   isListening 
                   ? "bg-white text-black shadow-[0_0_80px_rgba(255,255,255,0.6)] scale-95" 
                   : "bg-black text-white border-[12px] md:border-[16px] border-white hover:bg-zinc-900"
                 }`}
                 aria-label={isListening ? "Listening... click to stop" : "Click or press Spacebar to talk to AI assistant"}
                 aria-pressed={isListening}
               >
                 {isListening ? (
                   <div className="flex space-x-2 md:space-x-4 items-center justify-center h-full">
                     <div className="w-4 h-16 md:h-32 bg-black rounded-full animate-bounce"></div>
                     <div className="w-4 h-24 md:h-48 bg-black rounded-full animate-bounce delay-100"></div>
                     <div className="w-4 h-12 md:h-24 bg-black rounded-full animate-bounce delay-200"></div>
                     <div className="w-4 h-20 md:h-40 bg-black rounded-full animate-bounce delay-300"></div>
                   </div>
                 ) : (
                   <Mic size={64} className="md:w-32 md:h-32" />
                 )}
               </button>
            </div>
          </div>
        </div>
        
        {/* Helper text & Captions Container */}
        <div className="z-10 text-center mt-[340px] md:mt-[550px] w-full max-w-5xl flex flex-col items-center">
          {isListening && (
            <h2 className="text-4xl md:text-7xl font-black uppercase bg-black px-6 md:px-8 py-3 md:py-4 inline-block mb-6 md:mb-8 text-white border-4 border-white shadow-[8px_8px_0_0_#FFFFFF]">
              I'm Listening
            </h2>
          )}
          
          <div aria-live="assertive" className="min-h-[8rem] w-full space-y-6">
            {transcript && (
              <p className="text-3xl md:text-4xl font-bold bg-black px-6 py-4 text-white border-l-[12px] border-white text-left w-full mx-auto max-w-4xl shadow-xl">
                "{transcript}"
              </p>
            )}
            {aiResponse && (
              <p className="text-4xl md:text-6xl font-black bg-white text-black px-6 md:px-10 py-6 md:py-8 w-full text-left uppercase leading-none shadow-[16px_16px_0_0_rgba(255,255,255,0.2)]">
                {aiResponse}
              </p>
            )}
          </div>
          
          <div className="mt-16 text-center w-full max-w-lg mx-auto flex flex-col md:flex-row gap-4 items-center justify-center">
            <div className="bg-white text-black px-6 py-4 rounded-full text-lg md:text-xl font-black uppercase tracking-tighter inline-block shadow-2xl border-4 border-white whitespace-nowrap" aria-hidden="true">
              Hold [Space] to speak with AI
            </div>
            <button 
              onClick={toggleLanguage}
              className="bg-white text-black px-6 py-4 rounded-full text-lg md:text-xl font-black uppercase tracking-tighter shadow-2xl border-4 border-white hover:bg-black hover:text-white hover:border-white whitespace-nowrap outline-none focus:ring-8 focus:ring-white transition-colors"
              aria-label={`Current language: ${listeningLanguage === 'en-US' ? 'English' : 'Tamil'}. Press L or click to switch.`}
            >
              [L] Lang: {listeningLanguage === 'en-US' ? 'English' : 'தமிழ்'}
            </button>
          </div>
        </div>
      </main>

      <footer className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 md:gap-12 mt-16 md:mt-24 pt-12 md:pt-16 border-t-[12px] md:border-t-[16px] border-zinc-900">
        <section className="bg-white text-black p-8 md:p-10 border-b-[16px] md:border-b-[24px] border-black shadow-2xl" tabIndex={0} aria-label="Today's Classes">
          <p className="text-2xl md:text-3xl font-black uppercase mb-6 tracking-tighter">Up Next</p>
          <div className="space-y-10">
            {studentData.todayClasses.slice(0, 2).map((cls, idx) => (
              <div key={idx}>
                <h3 className="text-4xl md:text-5xl font-black leading-none">{cls.subject}</h3>
                <p className="text-2xl md:text-3xl font-bold mt-3 opacity-90">Room {cls.room} • {cls.time}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-black text-white border-[8px] md:border-[12px] border-white p-8 md:p-10 flex flex-col justify-start shadow-xl" tabIndex={0} aria-label="Assignments">
          <p className="text-2xl md:text-3xl font-black uppercase text-white mb-6 tracking-tighter">Assignments / Homework</p>
          <div className="space-y-8">
            {studentData.assignments.map((ast, idx) => (
              <div key={idx} className="border-l-[12px] border-white pl-6 md:pl-8 py-2">
                 <h3 className="text-3xl md:text-4xl font-bold leading-tight">{ast.task}</h3>
                 <p className="text-xl md:text-2xl font-black uppercase text-white mt-3">{ast.subject} - Due: {ast.due}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white text-black p-8 md:p-10 border-r-[16px] md:border-r-[24px] border-black flex flex-col justify-start md:col-span-2 xl:col-span-1 shadow-2xl" tabIndex={0} aria-label="Announcements">
          <p className="text-2xl md:text-3xl font-black uppercase mb-6 tracking-tighter">Alerts</p>
          <ul className="space-y-6">
            {studentData.announcements.map((ann, idx) => (
              <li key={idx} className="text-2xl md:text-4xl font-bold italic tracking-tight border-b-8 border-black pb-6 border-opacity-10">
                {ann}
              </li>
            ))}
          </ul>
        </section>
      </footer>

      {showBrailleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm">
          <div 
            className="bg-black border-[8px] md:border-[16px] border-white p-8 md:p-16 max-w-2xl w-full relative shadow-2xl"
            role="dialog"
            aria-labelledby="braille-modal-title"
          >
            <button 
              onClick={() => {
                setShowBrailleModal(false);
                if (brailleStatus === 'scanning') setBrailleStatus('disconnected');
              }}
              className="absolute top-4 right-4 md:top-8 md:right-8 bg-white text-black p-2 hover:bg-zinc-300 transition-colors focus:ring-4 focus:ring-white outline-none"
              aria-label="Close modal"
            >
              <X size={32} />
            </button>
            <h2 id="braille-modal-title" className="text-4xl md:text-6xl font-black uppercase mb-8 leading-none tracking-tighter">
              Connect Braille
            </h2>
            
            <p className="text-xl md:text-2xl font-bold mb-12 opacity-80 leading-relaxed">
              Pair your refreshable Braille display and keyboard. Ensure Bluetooth is enabled on your device.
            </p>

            <div className="flex flex-col items-center w-full gap-4">
              {brailleStatus === "disconnected" && (
                <>
                  <button 
                     onClick={connectBraille}
                     className="w-full bg-white text-black py-6 md:py-8 text-3xl md:text-4xl font-black uppercase tracking-tighter hover:bg-zinc-200 transition-colors flex items-center justify-center gap-4 focus:ring-8 focus:ring-white outline-none"
                  >
                    <Bluetooth size={40} />
                    Scan for BT Devices
                  </button>
                  <button 
                     onClick={() => setShowESP32Modal(true)}
                     className="w-full bg-zinc-800 text-white border-4 border-zinc-700 py-4 md:py-6 text-2xl md:text-3xl font-bold uppercase tracking-tighter hover:bg-zinc-700 transition-colors flex items-center justify-center gap-4 focus:ring-8 focus:ring-white outline-none"
                  >
                    <Cpu size={32} />
                    ESP32 Hardware Guide
                  </button>
                </>
              )}

              {brailleStatus === "scanning" && (
                <div className="flex flex-col items-center justify-center text-white py-8">
                  <Loader2 size={64} className="animate-spin mb-6" aria-hidden="true" />
                  <p className="text-3xl font-bold uppercase tracking-tighter" aria-live="polite">Searching...</p>
                </div>
              )}

              {brailleStatus === "connected" && (
                <div className="flex flex-col items-center justify-center text-white py-8">
                  <div className="bg-white text-black p-4 rounded-full mb-6">
                    <BluetoothConnected size={64} aria-hidden="true" />
                  </div>
                  <p className="text-3xl font-bold uppercase tracking-tighter" aria-live="polite">Connected Successfully!</p>
                </div>
              )}
            </div>
            <p className="mt-8 text-lg font-bold opacity-50 text-center">* Bluetooth mode is Prototype</p>
          </div>
        </div>
      )}

      {showESP32Modal && <ESP32GuideModal onClose={() => setShowESP32Modal(false)} />}
    </div>
  );
}

