import { useRef, useState } from 'react';
import { extractDocument } from '../api';
import { useAuth } from '../context/AuthContext';

interface ExtractedFields {
  doctor_name?: string;
  doctor_reg?: string;
  diagnosis?: string;
  medicines_prescribed?: string[];
  procedures?: string[];
  tests_prescribed?: string[];
  treatment?: string;
  bill_items?: Record<string, number>;
  total_amount?: number;
  hospital?: string;
  patient_name?: string;
}

interface Props {
  onExtracted: (fields: ExtractedFields) => void;
}

export default function DocumentUpload({ onExtracted }: Props) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(f: File) {
    setFile(f);
    setDone(false);
    setError('');
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function extract() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const result = await extractDocument(file, token);
      onExtracted(result as ExtractedFields);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setFile(null);
    setPreview(null);
    setDone(false);
    setError('');
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          Document Upload
          <span className="text-xs font-normal text-gray-400 normal-case tracking-normal">(AI extraction)</span>
        </h3>
        {file && (
          <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
        )}
      </div>

      {!file ? (
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-500">Drop prescription or bill here</p>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG, PDF supported</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Preview */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
            {preview ? (
              <img src={preview} alt="Uploaded document" className="w-20 h-20 object-cover rounded-lg border border-gray-200 shrink-0" />
            ) : (
              <div className="w-20 h-20 bg-red-50 rounded-lg border border-red-100 flex items-center justify-center shrink-0">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}</p>
              {done && (
                <div className="mt-1 flex items-center gap-1 text-xs text-green-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Fields extracted — form pre-filled
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {!done && (
            <button
              onClick={extract}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  AI is reading document…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Extract Fields with AI
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
