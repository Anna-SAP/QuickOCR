import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Scissors, Copy, Download, Loader2, Image as ImageIcon, Languages, ArrowRight, History, X, Clock } from 'lucide-react';
import { extractTextFromImage, translateText } from './services/ocrService';

interface HistoryItem {
  id: string;
  timestamp: number;
  extractedText: string;
  detectedLanguage: string | null;
  languageCode: string | null;
  translatedText: string | null;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [languageCode, setLanguageCode] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ocr_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ocr_history', JSON.stringify(history));
  }, [history]);

  const loadHistoryItem = (item: HistoryItem) => {
    setImage(null); // Clear image as we don't store it in history to save space
    setExtractedText(item.extractedText);
    setDetectedLanguage(item.detectedLanguage);
    setLanguageCode(item.languageCode);
    setTranslatedText(item.translatedText);
    setCurrentHistoryId(item.id);
    setIsHistoryOpen(false);
  };

  const processImage = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('文件大小不能超过 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件');
      return;
    }

    setError(null);
    setLastFile(file);
    setIsProcessing(true);
    setExtractedText('');
    setDetectedLanguage(null);
    setLanguageCode(null);
    setTranslatedText(null);

    try {
      // Convert to base64 for API and preview
      const fullDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
      setImage(fullDataUrl);
      
      const base64Data = fullDataUrl.split(',')[1];

      const result = await extractTextFromImage(base64Data, file.type);
      setExtractedText(result.text);
      setDetectedLanguage(result.language);
      setLanguageCode(result.languageCode);

      const newId = Date.now().toString();
      setCurrentHistoryId(newId);
      setHistory(prev => [{
        id: newId,
        timestamp: Date.now(),
        extractedText: result.text,
        detectedLanguage: result.language,
        languageCode: result.languageCode,
        translatedText: null
      }, ...prev].slice(0, 20)); // Keep last 20 items
    } catch (err: any) {
      setError(err?.message || '识别失败，请重试');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Drag and Drop Handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }, []);

  // 2. Clipboard Paste Handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processImage(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // 3. File Input Handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  // 4. Screen Capture Handler
  const handleScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Stop all tracks to end sharing
      stream.getTracks().forEach(track => track.stop());

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "capture.png", { type: "image/png" });
          processImage(file);
        }
      }, 'image/png');

    } catch (err) {
      console.error("Screen capture failed:", err);
      setError("屏幕截图失败或被取消");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(extractedText);
  };

  const handleExport = () => {
    const textToExport = translatedText ? `原文:\n${extractedText}\n\n译文:\n${translatedText}` : extractedText;
    const blob = new Blob([textToExport], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted-text.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTargetLanguage = (code: string | null) => {
    if (!code) return 'English';
    if (code.toLowerCase().startsWith('en')) return 'Simplified Chinese';
    if (code.toLowerCase().startsWith('zh')) return 'English';
    return 'English';
  };

  const getTargetLanguageLabel = (code: string | null) => {
    if (!code) return '英文';
    if (code.toLowerCase().startsWith('en')) return '简体中文';
    if (code.toLowerCase().startsWith('zh')) return '英文';
    return '英文';
  };

  const handleTranslate = async () => {
    if (!extractedText || !languageCode) return;
    
    setIsTranslating(true);
    setError(null);
    try {
      const targetLang = getTargetLanguage(languageCode);
      const result = await translateText(extractedText, targetLang);
      setTranslatedText(result);
      
      if (currentHistoryId) {
        setHistory(prev => prev.map(item => 
          item.id === currentHistoryId ? { ...item, translatedText: result } : item
        ));
      }
    } catch (err: any) {
      setError(err?.message || '翻译失败，请重试');
      console.error(err);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">OCR</h1>
          <div className="relative">
            <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-[#7C4DFF] transition-colors shadow-sm"
            >
              <History className="w-4 h-4" />
              历史记录
            </button>
            {history.length > 0 && (
              <span className="absolute -top-2.5 -right-2.5 flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-bold text-white bg-[#0ea5e9] border-2 border-white rounded-full shadow-sm">
                {history.length}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Panel: Input Area */}
          <div className="flex flex-col gap-6">
            <div
              className={`relative flex flex-col items-center justify-center w-full h-[600px] rounded-2xl border-2 border-dashed transition-colors duration-200 cursor-pointer overflow-hidden
                ${isDragging ? 'border-[#7C4DFF] bg-[#F0F4FF]/80' : 'border-[#7C4DFF]/50 bg-[#F0F4FF]/30 hover:bg-[#F0F4FF]/60'}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
              />

              {image && !isProcessing ? (
                <div className="absolute inset-0 p-4">
                  <img src={image} alt="Preview" className="w-full h-full object-contain rounded-xl" />
                  <div className="absolute inset-0 bg-black/5 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white/90 px-4 py-2 rounded-lg font-medium shadow-sm">点击更换图片</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6">
                  {isProcessing ? (
                    <div className="flex flex-col items-center text-[#7C4DFF]">
                      <Loader2 className="w-10 h-10 animate-spin mb-4" />
                      <p className="font-medium">正在识别文字...</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-[#7C4DFF] rounded-xl flex items-center justify-center text-white mb-6 shadow-md shadow-[#7C4DFF]/20">
                        <Plus className="w-6 h-6" />
                      </div>
                      <p className="text-slate-800 text-lg mb-2">点击上传或将图片拖放到此处以提取文本</p>
                      <p className="text-slate-400 text-sm">最大尺寸：5MB</p>
                      <p className="text-slate-400 text-sm mt-4">支持 Ctrl+V 快捷粘贴</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="text-red-600 text-sm font-medium bg-red-50 border border-red-200/80 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2 text-left flex-1">
                  <span className="text-red-500 font-bold text-base shrink-0">⚠️</span>
                  <span className="leading-snug">{error}</span>
                </div>
                {lastFile && !isProcessing && (
                  <button
                    onClick={() => processImage(lastFile)}
                    className="shrink-0 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    重试
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-slate-400 text-sm font-medium">或者</span>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>

            <button
              onClick={handleScreenCapture}
              disabled={isProcessing}
              className="w-full py-4 bg-[#7C4DFF] hover:bg-[#6538E6] text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#7C4DFF]/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Scissors className="w-5 h-5" />
              截取屏幕
            </button>
          </div>

          {/* Right Panel: Result Area */}
          <div className="flex flex-col h-[600px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[#7C4DFF]" />
                  识别结果
                </h2>
                {detectedLanguage && !isProcessing && (
                  <span className="px-2.5 py-1 bg-[#F0F4FF] text-[#7C4DFF] text-xs font-medium rounded-md border border-[#7C4DFF]/20">
                    {detectedLanguage}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {extractedText && languageCode && !isProcessing && !translatedText && (
                  <button
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#7C4DFF] hover:bg-[#6538E6] rounded-lg transition-colors disabled:opacity-70"
                  >
                    {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    翻译为{getTargetLanguageLabel(languageCode)}
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  disabled={!extractedText || isProcessing}
                  className="p-2 text-slate-600 hover:text-[#7C4DFF] hover:bg-[#F0F4FF] rounded-lg transition-colors disabled:opacity-50"
                  title="复制文本"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button
                  onClick={handleExport}
                  disabled={!extractedText || isProcessing}
                  className="p-2 text-slate-600 hover:text-[#7C4DFF] hover:bg-[#F0F4FF] rounded-lg transition-colors disabled:opacity-50"
                  title="导出为 TXT"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 p-6 overflow-auto">
              {isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#7C4DFF]" />
                  <p>AI 正在深度解析图像内容...</p>
                </div>
              ) : extractedText ? (
                <div className="flex flex-col gap-6">
                  <div className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                    {extractedText}
                  </div>
                  
                  {translatedText && (
                    <div className="pt-6 border-t border-slate-200">
                      <div className="flex items-center gap-2 mb-3 text-slate-500 font-medium text-sm">
                        <Languages className="w-4 h-4" />
                        译文 ({getTargetLanguageLabel(languageCode)})
                      </div>
                      <div className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                        {translatedText}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <p>上传图片后，提取的文字将显示在这里</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History Drawer Overlay */}
        {isHistoryOpen && (
          <div className="fixed inset-0 bg-slate-900/20 z-40 transition-opacity" onClick={() => setIsHistoryOpen(false)} />
        )}
        
        {/* History Drawer Panel */}
        <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isHistoryOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#7C4DFF]"/> 
              历史记录
            </h2>
            <button onClick={() => setIsHistoryOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
              <X className="w-5 h-5"/>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {history.length === 0 ? (
              <div className="text-center text-slate-400 mt-10 flex flex-col items-center gap-2">
                <History className="w-8 h-8 opacity-20" />
                <p className="text-sm">暂无历史记录</p>
              </div>
            ) : (
              history.map(item => (
                <div 
                  key={item.id} 
                  className={`border rounded-xl p-3 cursor-pointer transition-all hover:shadow-md ${currentHistoryId === item.id ? 'border-[#7C4DFF] bg-[#7C4DFF]/5' : 'border-slate-200 hover:border-[#7C4DFF]/50'}`}
                  onClick={() => loadHistoryItem(item)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs text-slate-400 font-medium">{new Date(item.timestamp).toLocaleString()}</span>
                    {item.detectedLanguage && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                        {item.detectedLanguage}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-700 line-clamp-3 leading-relaxed">
                    {item.extractedText}
                  </div>
                </div>
              ))
            )}
          </div>

          {history.length > 0 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => {
                  setHistory([]);
                  setCurrentHistoryId(null);
                }}
                className="w-full py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium"
              >
                清空历史记录
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
