import React, { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';

export default function DriverAvatar({ driver, size = 'md', showUpload = false, onPhotoUpdate }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  const sizeClass = sizes[size] || sizes.md;
  const photoUrl = driver?.photoUrl || driver?.photo || null;
  const initials = String(driver?.name || '?').charAt(0).toUpperCase();

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        if (onPhotoUpdate) {
          await onPhotoUpdate(base64);
        }
        setUploading(false);
      };
      reader.onerror = () => {
        console.error('Failed to read photo file');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Photo upload failed:', err);
      setUploading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div className={`${sizeClass} rounded-full overflow-hidden flex items-center justify-center font-semibold uppercase shrink-0 ${
        photoUrl ? '' : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
      }`}>
        {photoUrl ? (
          <img src={photoUrl} alt={driver?.name || 'Driver'} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {showUpload && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#2A52AC] text-white rounded-full flex items-center justify-center shadow-md hover:bg-[#1F428F] transition-colors cursor-pointer"
          >
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}
