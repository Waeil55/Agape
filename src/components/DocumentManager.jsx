import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, X, Eye, Trash2, Loader2, Shield, Clock } from 'lucide-react';

const DOCUMENT_TYPES = [
  { id: 'license', label: 'Driver License', icon: '🪪', required: true },
  { id: 'insurance', label: 'Insurance Card', icon: '🛡️', required: true },
  { id: 'registration', label: 'Vehicle Registration', icon: '📋', required: true },
  { id: 'background_check', label: 'Background Check', icon: '🔍', required: true },
  { id: 'drug_test', label: 'Drug Test Results', icon: '🧪', required: false },
  { id: 'cpr', label: 'CPR Certification', icon: '❤️', required: false },
  { id: 'first_aid', label: 'First Aid Certification', icon: '🩹', required: false },
  { id: 'defensive_driving', label: 'Defensive Driving', icon: '🚗', required: false },
  { id: 'medical_card', label: 'Medical Card', icon: '🏥', required: false },
  { id: 'other', label: 'Other Document', icon: '📄', required: false },
];

const STATUS_COLORS = {
  verified: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
  expired: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: AlertTriangle },
  missing: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', icon: FileText },
};

export function getDocumentStatus(doc) {
  if (!doc || !doc.fileUrl) return 'missing';
  if (doc.expiryDate) {
    const expiry = new Date(doc.expiryDate);
    if (expiry < new Date()) return 'expired';
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (expiry < thirtyDays) return 'expiring';
  }
  if (doc.verified) return 'verified';
  return 'pending';
}

export function getDocumentStatusInfo(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.missing;
}

export default function DocumentManager({ driver, documents = [], onUpdate, readOnly = false }) {
  const [uploading, setUploading] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const fileInputRef = useRef(null);

  const handleUpload = async (docType, file) => {
    if (!file || !driver?.id) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Document must be less than 10MB');
      return;
    }

    setUploading(docType);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const docData = {
          type: docType,
          fileName: file.name,
          fileUrl: base64,
          uploadedAt: new Date().toISOString(),
          verified: false,
          expiryDate: null,
        };

        if (onUpdate) {
          await onUpdate(docType, docData);
        }
        setUploading(null);
      };
      reader.onerror = () => {
        console.error('Failed to read document file');
        setUploading(null);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Document upload failed:', err);
      setUploading(null);
    }
  };

  const handleDelete = async (docType) => {
    if (!window.confirm('Delete this document?')) return;
    if (onUpdate) {
      await onUpdate(docType, null);
    }
  };

  const getDocForType = (type) => documents.find(d => d.type === type);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">Documents & Compliance</h3>
        <span className="text-[10px] text-slate-500">{documents.filter(d => d.fileUrl).length}/{DOCUMENT_TYPES.length} uploaded</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DOCUMENT_TYPES.map(docType => {
          const doc = getDocForType(docType.id);
          const status = getDocumentStatus(doc);
          const statusInfo = getDocumentStatusInfo(status);
          const StatusIcon = statusInfo.icon;
          const isUploading = uploading === docType.id;

          return (
            <div key={docType.id} className={`flex items-center gap-3 p-3 rounded-xl border ${statusInfo.border} ${statusInfo.bg}`}>
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-sm shrink-0">
                {docType.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold text-slate-900 truncate">{docType.label}</p>
                  {docType.required && <span className="text-[8px] text-rose-500 font-semibold">REQUIRED</span>}
                </div>
                {doc?.fileUrl ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusIcon size={10} className={statusInfo.text} />
                    <span className={`text-[10px] font-medium ${statusInfo.text}`}>
                      {status === 'verified' ? 'Verified' : status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring Soon' : 'Pending'}
                    </span>
                    {doc.expiryDate && (
                      <span className="text-[9px] text-slate-400">Exp: {new Date(doc.expiryDate).toLocaleDateString()}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-0.5">Not uploaded</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {doc?.fileUrl && (
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition"
                    title="Preview"
                  >
                    <Eye size={12} className="text-slate-500" />
                  </button>
                )}
                {!readOnly && (
                  <>
                    {isUploading ? (
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Loader2 size={12} className="text-blue-500 animate-spin" />
                      </div>
                    ) : (
                      <label className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center hover:bg-blue-100 transition cursor-pointer">
                        <Upload size={12} className="text-blue-600" />
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => handleUpload(docType.id, e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>
                    )}
                    {doc?.fileUrl && (
                      <button
                        onClick={() => handleDelete(docType.id)}
                        className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center hover:bg-rose-100 transition"
                        title="Delete"
                      >
                        <Trash2 size={12} className="text-rose-500" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setPreviewDoc(null)}>
          <div className="bg-white rounded-2xl max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">{previewDoc.fileName || 'Document'}</h3>
              <button onClick={() => setPreviewDoc(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              {previewDoc.fileUrl?.startsWith('data:image') ? (
                <img src={previewDoc.fileUrl} alt="Document" className="max-w-full h-auto rounded-lg" />
              ) : previewDoc.fileUrl?.startsWith('data:application/pdf') ? (
                <iframe src={previewDoc.fileUrl} className="w-full h-96 rounded-lg" title="PDF Document" />
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <FileText size={48} className="mx-auto mb-4 text-slate-300" />
                  <p>Preview not available for this file type</p>
                </div>
              )}
            </div>
            {previewDoc.uploadedAt && (
              <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400">
                Uploaded: {new Date(previewDoc.uploadedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
