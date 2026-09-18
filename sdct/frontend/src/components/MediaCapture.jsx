import React, { useRef } from 'react';
import { standardFilename, mediaBlobPath } from '../lib/naming.js';
import { fmtBytes, uuid } from '../lib/format.js';

async function probe(file) {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('image/')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ url, widthPx: img.naturalWidth, heightPx: img.naturalHeight, durationS: null });
      img.onerror = () => resolve({ url, widthPx: null, heightPx: null, durationS: null });
      img.src = url;
    });
  }
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve({ url, widthPx: v.videoWidth, heightPx: v.videoHeight, durationS: Math.round(v.duration * 10) / 10 });
    v.onerror = () => resolve({ url, widthPx: null, heightPx: null, durationS: null });
    v.src = url;
  });
}

export function MediaCapture({ field, items, onChange, context, readOnly, registerRef }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const isVideo = field.dataType === 'media_video';

  const add = async (files) => {
    const now = new Date();
    const next = [...items];
    let seq = items.length;
    for (const file of Array.from(files || [])) {
      seq += 1;
      const meta = await probe(file);
      const standard = standardFilename({ ...context, domainCode: field.domainCode, fieldCode: field.fieldCode, capturedAt: now, seq, contentType: file.type, originalName: file.name });
      next.push({
        mediaAssetId: `MED-${uuid().slice(0, 8).toUpperCase()}`, fieldCode: field.fieldCode, mediaType: isVideo ? 'VIDEO' : 'PHOTO',
        blobContainer: 'media', blobPath: mediaBlobPath(context, standard), standardFilename: standard, originalFilename: file.name,
        contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'), sizeBytes: file.size, widthPx: meta.widthPx, heightPx: meta.heightPx, durationS: meta.durationS,
        capturedAt: new Date(file.lastModified || now).toISOString(), deviceModel: navigator.userAgent.includes('iPad') ? 'iPad' : navigator.platform || null,
        previewUrl: meta.url, file,
      });
    }
    onChange(next);
  };
  const remove = (id) => onChange(items.filter((m) => m.mediaAssetId !== id));

  return (
    <div className="stack">
      <div className="media-tray">
        {items.map((m) => (
          <div key={m.mediaAssetId} className="thumb" title={m.standardFilename}>
            {m.previewUrl ? (m.mediaType === 'VIDEO' ? <video src={m.previewUrl} muted /> : <img src={m.previewUrl} alt={field.label} />) : <div className="ph">{m.mediaType === 'VIDEO' ? 'Video' : 'Photo'} in Blob</div>}
            <span className="tag">{m.mediaType === 'VIDEO' ? `${m.durationS ?? '?'}s` : `${m.widthPx || '?'}×${m.heightPx || '?'}`}</span>
            {!readOnly && <button type="button" className="x" aria-label="Remove" onClick={() => remove(m.mediaAssetId)}>✕</button>}
          </div>
        ))}
        {!readOnly && (
          <>
            <button type="button" className="media-btn" ref={registerRef} onClick={() => cameraRef.current?.click()}>
              {isVideo ? 'Record video' : 'Take photo'}<small>device camera</small>
            </button>
            <button type="button" className="media-btn" style={{ borderStyle: 'solid', background: 'var(--panel)' }} onClick={() => fileRef.current?.click()}>
              Upload<small>{isVideo ? 'mp4, mov' : 'jpg, png, heic'}</small>
            </button>
            <input ref={cameraRef} type="file" hidden accept={isVideo ? 'video/*' : 'image/*'} capture="environment" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            <input ref={fileRef} type="file" hidden multiple={!isVideo} accept={isVideo ? 'video/*' : 'image/*'} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>
      {items.length > 0 && (
        <div className="fname">
          {items.map((m) => <div key={m.mediaAssetId}>{m.standardFilename} <span className="muted">({fmtBytes(m.sizeBytes)})</span></div>)}
        </div>
      )}
    </div>
  );
}
