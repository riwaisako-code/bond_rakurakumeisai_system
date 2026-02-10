
import React, { useRef, useEffect, useState } from 'react';

interface CameraViewProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
}

const CameraView: React.FC<CameraViewProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          // Fixed: Changed '理想' to 'ideal' which is the standard property name for constraints
          video: { facingMode: 'environment', width: {ideal: 1920}, height: {ideal: 1080} },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setError("カメラへのアクセスを許可してください。");
      }
    }

    setupCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64Data = dataUrl.split(',')[1];
        onCapture(base64Data);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex-grow relative overflow-hidden flex items-center justify-center">
        {error ? (
          <div className="text-white p-6 text-center">
            <p className="mb-4">{error}</p>
            <button onClick={onClose} className="px-6 py-2 bg-white text-black rounded-full font-bold">戻る</button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            {/* Guide Overlay */}
            <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none flex items-center justify-center">
              <div className="w-full h-3/4 border-2 border-dashed border-white/60 rounded-lg"></div>
            </div>
            <p className="absolute top-10 left-0 right-0 text-center text-white text-sm font-medium drop-shadow-md">
              枠内に領収書を収めてください
            </p>
          </>
        )}
      </div>

      <div className="bg-black/80 backdrop-blur-md p-8 flex items-center justify-between safe-bottom">
        <button 
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center text-white bg-white/10 rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <button 
          onClick={capturePhoto}
          disabled={!!error}
          className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-1 active:scale-90 transition-transform disabled:opacity-50"
        >
          <div className="w-full h-full border-4 border-black/10 rounded-full flex items-center justify-center">
             <div className="w-14 h-14 bg-blue-600 rounded-full"></div>
          </div>
        </button>

        <div className="w-12 h-12"></div> {/* Spacer for symmetry */}
      </div>
      
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraView;
