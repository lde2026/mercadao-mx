'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';

interface Props {
  form: {
    photos: File[];
    photoPreviewUrls: string[];
    videoUrl: string;
  };
  update: (partial: { photos?: File[]; photoPreviewUrls?: string[]; videoUrl?: string }) => void;
}

export default function UploadMediaStep({ form, update }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mainIdx, setMainIdx] = useState(0);

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const newFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      const newUrls = newFiles.map((f) => URL.createObjectURL(f));
      update({
        photos: [...form.photos, ...newFiles],
        photoPreviewUrls: [...form.photoPreviewUrls, ...newUrls],
      });
    },
    [form.photos, form.photoPreviewUrls, update],
  );

  const removePhoto = (idx: number) => {
    const photos = form.photos.filter((_, i) => i !== idx);
    const urls = form.photoPreviewUrls.filter((_, i) => i !== idx);
    update({ photos, photoPreviewUrls: urls });
    if (mainIdx >= photos.length) setMainIdx(Math.max(0, photos.length - 1));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-slate-900 font-black text-xl mb-1">Fotos e mídia</h2>
        <p className="text-slate-500 text-sm">Adicione fotos de qualidade. Anúncios com boas fotos recebem muito mais contatos.</p>
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
          dragging ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
          <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-slate-700 font-semibold text-sm">Clique para adicionar fotos</p>
          <p className="text-slate-400 text-xs mt-1">ou arraste e solte aqui — JPG, PNG até 10MB</p>
          <p className="text-slate-300 text-xs mt-1">No celular: escolha da galeria ou tire uma nova foto</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture={undefined}
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Photo previews */}
      {form.photoPreviewUrls.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-700 text-sm font-medium">
              {form.photoPreviewUrls.length} {form.photoPreviewUrls.length === 1 ? 'foto' : 'fotos'} adicionadas
            </p>
            <p className="text-slate-400 text-xs">Toque em uma foto para definir como principal</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {form.photoPreviewUrls.map((url, idx) => (
              <div key={idx} className="relative aspect-square group">
                <button
                  type="button"
                  onClick={() => setMainIdx(idx)}
                  className={`relative w-full h-full rounded-xl overflow-hidden border-2 transition-colors ${
                    idx === mainIdx ? 'border-orange-500' : 'border-transparent'
                  }`}
                >
                  <Image src={url} alt={`Foto ${idx + 1}`} fill sizes="120px" className="object-cover" />
                  {idx === mainIdx && (
                    <div className="absolute bottom-0 left-0 right-0 bg-orange-500 text-white text-[10px] font-bold text-center py-0.5">
                      PRINCIPAL
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  aria-label="Remover foto"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {/* Add more */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Adicionar mais fotos"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Optional: Video URL */}
      <div>
        <label className="block text-slate-700 text-sm font-medium mb-1.5">
          Link de vídeo <span className="text-slate-400 text-xs">(opcional)</span>
        </label>
        <input
          type="url"
          placeholder="https://youtube.com/watch?v=..."
          value={form.videoUrl}
          onChange={(e) => update({ videoUrl: e.target.value })}
          className="input-base"
        />
        <p className="text-slate-400 text-xs mt-1">Cole o link de um vídeo do YouTube ou Instagram</p>
      </div>

      {form.photos.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
          <p className="text-yellow-700 text-xs font-medium">Adicione ao menos 1 foto para continuar</p>
        </div>
      )}
    </div>
  );
}
