import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { 
  Eraser, 
  Layers, 
  MousePointer2, 
  Send, 
  Upload, 
  Undo2, 
  Redo2, 
  Download,
  Image as ImageIcon,
  Wand2,
  Trash2,
  Languages,
  Loader2,
  BoxSelect,
  Plus,
  ChevronDown,
  FileDown,
  LogOut,
  Mail,
  Globe,
  Code,
  UserPlus,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { processImageEdits } from './lib/ai';
import UTIF from 'utif';
import { readPsd } from 'ag-psd';
import { auth, signInWithGoogle } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Layer {
  id: string;
  name: string;
  visible: boolean;
  type: string;
  thumbnail?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return <EditorView user={user} />;
}

function AuthView() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const handleAuth = async () => {
    setIsAuthorizing(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      alert("Kimlik doğrulama başarısız oldu.");
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0f0f0f] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Background Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/20 blur-[100px] rounded-full" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/20 blur-[100px] rounded-full" />

          <div className="relative z-10">
            <div className="flex justify-center mb-8">
              <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl shadow-indigo-500/20">
                <Wand2 size={32} className="text-white" />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-center tracking-tighter mb-2">
              M B G AI
            </h1>
            <p className="text-white/40 text-center text-sm mb-8 font-medium">
              Profesyonel AI Destekli Resim Editörü
            </p>

            <div className="space-y-4">
              <button 
                onClick={handleAuth}
                disabled={isAuthorizing}
                className="w-full h-14 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50"
              >
                {isAuthorizing ? <Loader2 className="animate-spin" /> : <Globe size={20} />}
                {mode === 'login' ? 'Google ile Giriş Yap' : 'Google ile Kayıt Ol'}
              </button>

              <div className="grid grid-cols-2 gap-4">
                <SocialButton icon={<Code size={20} />} label="GitHub" />
                <SocialButton icon={<Mail size={20} />} label="E-Posta" />
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5 text-center">
              {mode === 'login' ? (
                <div className="space-y-4">
                  <p className="text-sm text-white/40">Hesabınız yok mu?</p>
                  <button 
                    onClick={() => setMode('register')}
                    className="w-full py-3 bg-indigo-600/20 text-indigo-400 font-bold rounded-xl border border-indigo-500/30 hover:bg-indigo-600/30 transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus size={18} />
                    Hemen Kayıt Ol
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-white/40">Zaten hesabınız var mı?</p>
                  <button 
                    onClick={() => setMode('login')}
                    className="w-full py-3 bg-white/5 text-white/70 font-bold rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    <LogIn size={18} />
                    Giriş Yap'a Dön
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SocialButton({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <button className="flex-1 h-12 bg-white/5 rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/10 text-xs font-medium text-white/60">
      {icon}
      {label}
    </button>
  );
}

function EditorView({ user }: { user: User }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeTool, setActiveTool] = useState<'select' | 'eraser' | 'mask'>('select');
  const [isMasking, setIsMasking] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchImages, setBatchImages] = useState<string[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // --- File Conversion Helpers ---
  const convertTiffToDataUrl = (buffer: ArrayBuffer): string => {
    const ifds = UTIF.decode(buffer);
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = document.createElement('canvas');
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  };

  const convertPsdToDataUrl = (buffer: ArrayBuffer): string => {
    const psd = readPsd(buffer);
    if (!psd.canvas) return '';
    return psd.canvas.toDataURL();
  };

  // --- Canvas Setup ---
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#1a1a1a',
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;

    const updateLayers = () => {
      const objects = canvas.getObjects();
      const newLayers = objects.map((obj, i) => ({
        id: (obj as any).id || `layer-${i}`,
        name: (obj as any).name || `${obj.type} ${i + 1}`,
        visible: obj.visible || false,
        type: obj.type || 'unknown',
      })).reverse();
      setLayers(newLayers);
    };

    canvas.on('object:added', updateLayers);
    canvas.on('object:removed', updateLayers);
    canvas.on('selection:created', (e) => setActiveLayerId((e.selected?.[0] as any)?.id || null));
    canvas.on('selection:updated', (e) => setActiveLayerId((e.selected?.[0] as any)?.id || null));
    canvas.on('selection:cleared', () => setActiveLayerId(null));

    // Handle Brush for Masking
    canvas.on('path:created', (opt) => {
      if (activeTool === 'mask') {
        const path = opt.path;
        if (path) {
          (path as any).id = `mask-path-${Date.now()}`;
          (path as any).isMaskPart = true;
          path.selectable = false;
          path.evented = false;
        }
      }
    });

    // Responsive Canvas
    const resizeCanvas = () => {
      if (containerRef.current && fabricRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        fabricRef.current.setDimensions({ width, height });
        fabricRef.current.renderAll();
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    if (activeTool === 'mask') {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.width = 30;
      brush.color = 'rgba(99, 102, 241, 0.4)'; // Indigo-500 with alpha
      canvas.freeDrawingBrush = brush;
    } else {
      canvas.isDrawingMode = false;
    }
  }, [activeTool]);

  // --- Handlers ---
  const onDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      try {
        let url = '';
        if (extension === 'psd') {
          const buffer = await file.arrayBuffer();
          url = convertPsdToDataUrl(buffer);
        } else if (extension === 'tif' || extension === 'tiff') {
          const buffer = await file.arrayBuffer();
          url = convertTiffToDataUrl(buffer);
        } else {
          url = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
        }

        if (url) {
          fabric.Image.fromURL(url).then((img) => {
            img.scale(0.5);
            (img as any).id = `img-${Date.now()}`;
            (img as any).name = file.name;
            fabricRef.current?.add(img);
            fabricRef.current?.setActiveObject(img);
            setBatchImages(prev => [...prev, url]);
          });
        }
      } catch (error) {
        console.error(`Error loading ${file.name}:`, error);
        alert(`${file.name} yüklenirken bir hata oluştu.`);
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    noClick: layers.length > 0,
    accept: { 
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'],
      'image/vnd.adobe.photoshop': ['.psd'],
      'application/x-photoshop': ['.psd']
    }
  } as any);

  const handleAiEdit = async () => {
    if (!aiPrompt || !fabricRef.current) return;
    setIsProcessing(true);

    try {
      const activeObject = fabricRef.current.getActiveObject();
      if (!activeObject || activeObject.type !== 'image') {
        alert("Lütfen düzenlemek istediğiniz bir resmi seçin.");
        return;
      }

      // Capture active object data
      const dataUrl = activeObject.toDataURL({ format: 'png' });
      
      // If we have a mask selection (simplified as a bounding box for this demo)
      // or we could implement a real brush mask.
      
      const result = await processImageEdits(dataUrl, aiPrompt);
      
      if (result) {
        fabric.Image.fromURL(result).then((newImg) => {
          newImg.set({
            left: activeObject.left,
            top: activeObject.top,
            scaleX: activeObject.scaleX,
            scaleY: activeObject.scaleY,
          });
          (newImg as any).id = (activeObject as any).id;
          (newImg as any).name = `AI Edited: ${(activeObject as any).name}`;
          
          fabricRef.current?.remove(activeObject);
          fabricRef.current?.add(newImg);
          fabricRef.current?.setActiveObject(newImg);
          fabricRef.current?.renderAll();
        });
      }
      setAiPrompt("");
    } catch (err) {
      console.error(err);
      alert("AI düzenleme sırasında bir hata oluştu.");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearMasks = () => {
    if (!fabricRef.current) return;
    const objects = fabricRef.current.getObjects().filter(o => (o as any).isMaskPart);
    fabricRef.current.remove(...objects);
    fabricRef.current.renderAll();
    setMaskDataUrl(null);
  };

  const generateMaskFromAI = async () => {
    const activeObject = fabricRef.current?.getActiveObject();
    if (!activeObject || activeObject.type !== 'image') {
      alert("Lütfen önce üzerinde maskeleme yapmak istediğiniz bir resim seçin.");
      return;
    }

    setIsProcessing(true);
    try {
      // Capture the canvas with the brush strokes as overlay
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = fabricRef.current!.width;
      tempCanvas.height = fabricRef.current!.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      // Draw active object first
      const dataUrl = fabricRef.current!.toDataURL({ format: 'png' });
      
      const result = await processImageEdits(
        dataUrl, 
        "Generate a precise black and white binary mask for the object indicated by the indigo brush strokes. Return ONLY the mask image."
      );
      
      if (result) {
        setMaskDataUrl(result);
        alert("AI Maskesi başarıyla oluşturuldu.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchProcess = async () => {
    if (!aiPrompt || batchImages.length === 0) return;
    setIsProcessing(true);
    
    const results: string[] = [];
    for (const imgUrl of batchImages) {
      try {
        const result = await processImageEdits(imgUrl, aiPrompt);
        if (result) results.push(result);
      } catch (err) {
        console.error("Batch Error:", err);
      }
    }
    
    // Replace all images on canvas or just add results
    results.forEach(res => {
      fabric.Image.fromURL(res).then(img => {
        img.scale(0.3);
        fabricRef.current?.add(img);
      });
    });
    
    setIsProcessing(false);
    setAiPrompt("");
    alert(`${results.length} resim başarıyla işlendi.`);
  };

  const applyEffect = (effect: string) => {
    setAiPrompt(prev => prev ? `${prev} with ${effect}` : effect);
  };

  const exportImage = (format: 'png' | 'jpeg' | 'tiff' = 'png') => {
    if (!fabricRef.current) return;
    
    let dataUrl = '';
    if (format === 'tiff') {
      // Basic TIFF export via UTIF is complex, we'll proxy it via canvas data if needed
      // For this demo, let's focus on high-quality PNG/JPG
      dataUrl = fabricRef.current.toDataURL({ format: 'png', multiplier: 2 });
    } else {
      dataUrl = fabricRef.current.toDataURL({
        format: format,
        multiplier: 2,
        quality: 1
      });
    }

    const link = document.createElement('a');
    link.download = `lumina-export.${format}`;
    link.href = dataUrl;
    link.click();
    setShowExportMenu(false);
  };

  return (
    <div id="lumina-app-root" className="flex h-screen w-screen bg-[#0a0a0a] text-white overflow-hidden font-sans">
      {/* Sidebar Toolrail */}
      <div id="lumina-sidebar" className="w-16 border-r border-white/10 flex flex-col items-center py-6 gap-6 bg-[#0f0f0f]">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl mb-4 shadow-lg shadow-indigo-500/20">
          <Wand2 size={24} />
        </div>
        
        <div className="flex flex-col gap-3">
          <ToolButton 
            active={activeTool === 'select'} 
            onClick={() => setActiveTool('select')}
            icon={<MousePointer2 size={20} />} 
          />
          <ToolButton 
            active={activeTool === 'eraser'} 
            onClick={() => setActiveTool('eraser')}
            icon={<Eraser size={20} />} 
          />
          <ToolButton 
            active={activeTool === 'mask'} 
            onClick={() => setActiveTool('mask')}
            icon={<Wand2 size={20} />} 
          />
        </div>

        <div className="mt-auto flex flex-col gap-3 pb-4">
          <ToolButton onClick={() => setShowBatch(!showBatch)} active={showBatch} icon={<Layers size={20} />} />
          <div className="relative">
            <ToolButton onClick={() => setShowExportMenu(!showExportMenu)} active={showExportMenu} icon={<Download size={20} />} />
            <AnimatePresence>
              {showExportMenu && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute bottom-0 left-16 w-48 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-2 z-50"
                >
                  <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-2 px-2">Dışa Aktar</p>
                  <ExportOption onClick={() => exportImage('png')} label="PNG (Yüksek Kalite)" sub="Kaypsız sıkıştırma" />
                  <ExportOption onClick={() => exportImage('jpeg')} label="JPG (Web İçin)" sub="Dengeli boyut" />
                  <ExportOption onClick={() => exportImage('tiff')} label="TIFF (Baskı)" sub="Arşivlik format" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header Bar */}
        <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#0f0f0f]">
          <div className="flex items-center gap-4">
            <span className="font-bold text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/50">
              M B G AI
            </span>
            <div className="hidden md:flex items-center gap-1 ml-4 rounded-lg bg-white/5 p-1">
              <button className="p-1 px-2 hover:bg-white/10 rounded text-xs font-medium">Dosya</button>
              <button className="p-1 px-2 hover:bg-white/10 rounded text-xs font-medium">Düzenle</button>
              <button className="p-1 px-2 hover:bg-white/10 rounded text-xs font-medium">Görünüm</button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-white/5 rounded-full px-3 py-1 text-xs text-white/60">
              <img src={user.photoURL || ''} className="w-5 h-5 rounded-full border border-white/10" alt="" />
              <span>{user.displayName?.split(' ')[0]}</span>
            </div>
            
            <button 
              onClick={() => signOut(auth)}
              className="p-2 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-colors"
              title="Çıkış Yap"
            >
              <LogOut size={18} />
            </button>
            
            <button 
              onClick={() => fabricRef.current?.clear()}
              className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        {/* Canvas Area */}
        <div 
          {...getRootProps()} 
          ref={containerRef}
          className={cn(
            "flex-1 relative bg-grid-white/[0.02]",
            isDragActive && "bg-indigo-500/5 ring-2 ring-indigo-500 ring-inset"
          )}
        >
          <input {...getInputProps()} />
          <canvas ref={canvasRef} />
          
          <AnimatePresence>
            {activeTool === 'mask' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-2xl p-2 shadow-2xl z-40"
              >
                <div className="flex items-center gap-2 px-3 mr-2 border-r border-white/10 text-xs font-bold text-white/40 uppercase tracking-widest">
                  <BoxSelect size={14} className="text-indigo-400" />
                  Akıllı Fırça
                </div>
                <button 
                  onClick={clearMasks}
                  className="px-4 py-2 hover:bg-white/5 rounded-xl text-xs font-semibold text-white/60"
                >
                  Temizle
                </button>
                <button 
                  onClick={generateMaskFromAI}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20"
                >
                  AI ile Maskele
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {layers.length === 0 && !isDragActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
              <div className="p-8 border-2 border-dashed border-white/20 rounded-3xl flex flex-col items-center gap-4">
                <Upload size={48} />
                <p className="text-lg font-medium text-center">Resmi buraya sürükleyin veya tıklayın</p>
                <div className="flex gap-2">
                   <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono">PNG</span>
                   <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono">JPG</span>
                   <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono">PSD</span>
                   <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono">TIFF</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AI Command Bar */}
        <div id="ai-command-container" className="p-4 bg-[#0f0f0f] border-t border-white/10">
          <div className="max-w-4xl mx-auto mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {['Siberpunk', 'Vintage', 'Yağlı Boya', 'Sinematik', 'Anime', 'Kara Kalem'].map((effect) => (
              <button 
                key={effect}
                onClick={() => applyEffect(effect)}
                className="flex-shrink-0 px-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-[10px] font-bold border border-white/5 transition-all"
              >
                {effect}
              </button>
            ))}
          </div>
          
          <div id="ai-command-bar" className="max-w-4xl mx-auto flex gap-3 items-center bg-black/40 p-2 rounded-2xl border border-white/10 shadow-2xl focus-within:ring-1 ring-indigo-500/50 transition-all">
            <div className="p-3 bg-white/5 rounded-xl">
              <Wand2 size={20} className="text-indigo-400" />
            </div>
            <input 
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Yapay zekaya ne yapmak istediğinizi anlatın... (Örn: Arka planı değiştir)"
              className="flex-1 bg-transparent border-none outline-none text-sm py-2"
              onKeyDown={(e) => e.key === 'Enter' && handleAiEdit()}
            />
            <button 
              id="ai-submit-button"
              onClick={handleAiEdit}
              disabled={isProcessing || !aiPrompt}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/20"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Tamamla
            </button>
          </div>
        </div>
      </main>

      {/* Layers Panel */}
      <aside className="w-72 border-l border-white/10 bg-[#0f0f0f] flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">Katmanlar</span>
          <button 
            onClick={() => {
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = 'image/*';
              fileInput.onchange = (e: any) => {
                const file = e.target.files[0];
                if (file) onDrop([file]);
              };
              fileInput.click();
            }}
            className="p-1 hover:bg-white/10 rounded"
          >
            <Plus size={16} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
          <AnimatePresence mode="popLayout">
            {layers.length > 0 ? (
              layers.map((layer) => (
                <motion.div
                  key={layer.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onClick={() => {
                    const obj = fabricRef.current?.getObjects().find((o: any) => o.id === layer.id);
                    if (obj) fabricRef.current?.setActiveObject(obj).renderAll();
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl mb-1 cursor-pointer transition-all border border-transparent",
                    activeLayerId === layer.id ? "bg-white/10 border-white/10" : "hover:bg-white/5"
                  )}
                >
                  <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden border border-white/10">
                    <ImageIcon size={16} className="text-white/20" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-medium truncate">{layer.name}</p>
                    <p className="text-[10px] text-white/40 uppercase">{layer.type}</p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-48 opacity-20 text-center p-4">
                <Layers size={32} className="mb-2" />
                <p className="text-xs">Henüz katman yok</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Batch Drawer */}
        <AnimatePresence>
          {showBatch && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 200 }}
              exit={{ height: 0 }}
              className="border-t border-white/10 bg-black/40 overflow-hidden"
            >
              <div className="p-3 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">Toplu İşlem Kuyruğu</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleBatchProcess}
                    disabled={isProcessing || batchImages.length === 0}
                    className="text-[10px] px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-bold transition-all"
                  >
                    Tümüne Uygula
                  </button>
                  <span className="text-[10px] px-2 py-0.5 bg-white/10 rounded-full">{batchImages.length}</span>
                </div>
              </div>
              <div className="flex gap-2 p-2 overflow-x-auto h-32">
                {batchImages.map((src, i) => (
                  <div key={i} className="flex-shrink-0 w-24 h-24 rounded-lg bg-white/5 border border-white/10 overflow-hidden relative group">
                    <img src={src} className="w-full h-full object-cover" />
                    <button className="absolute inset-0 bg-indigo-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold transition-opacity">
                      Uygula
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

// --- Internal Components ---

function ToolButton({ active, icon, onClick }: { active?: boolean, icon: React.ReactNode, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-2.5 rounded-xl transition-all duration-200 relative group",
        active ? "bg-white text-black shadow-lg shadow-white/10" : "text-white/50 hover:text-white hover:bg-white/10"
      )}
    >
      <div className="relative z-10">{icon}</div>
      {active && (
        <motion.div 
          layoutId="active-tool" 
          className="absolute inset-0 bg-white rounded-xl" 
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );
}

function ExportOption({ onClick, label, sub }: { onClick: () => void, label: string, sub: string }) {
  return (
    <button 
      onClick={onClick}
      className="w-full text-left p-2 hover:bg-white/5 rounded-lg transition-colors group flex items-center justify-between"
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[10px] text-white/40">{sub}</p>
      </div>
      <FileDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
