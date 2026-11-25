import {useMemo, useRef, useState} from 'react';
import {CheckCircle, SpinnerGap, UploadSimple, X} from '@phosphor-icons/react';
import {Modal} from '../Modal.jsx';
import {hasImageColor} from '../../engine/image-color.mjs';
import {ColorLayer} from './ColorLayer.jsx';
import {colorPreviewWindow} from './color-preview.js';

export function ColorReferenceThumbnail({image}) {
  const crop = useMemo(() => image.source ? colorPreviewWindow(image) : undefined, [image]);
  return <span className="color-reference-thumbnail" aria-hidden="true">
    {crop || hasImageColor(image.color)
      ? <ColorLayer preview={image.preview} color={image.color} crop={crop} maxEdge={192}/>
      : <img src={image.thumbnail || image.preview} alt="" draggable={false}/>}
  </span>;
}

export function ColorReferenceDialog({images, reference, onSelect, onImport, onClose}) {
  const input = useRef(), picking = useRef(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  async function upload(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file || picking.current) return;
    picking.current = true;
    setLoading(true);setError('');
    try {
      await onImport(file);
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      picking.current = false;
      setLoading(false);
    }
  }
  return <Modal label="选择色彩参考图" className="color-reference-dialog" onCancel={loading ? undefined : onClose}>
    <header className="color-reference-dialog-header">
      <h2>选择色彩参考图</h2>
      <button type="button" className="icon-button" aria-label="关闭参考图选择" disabled={loading} onClick={onClose}>
        <X size={17} aria-hidden="true"/>
      </button>
    </header>
    <div className="color-reference-grid" aria-busy={loading}>
      {images.map((image, index) => {
        const selected = reference?.id === image.id;
        return <button key={image.id} type="button" className="color-reference-option"
          aria-pressed={selected} title={image.name} disabled={loading} onClick={() => {onSelect({imageId: image.id});onClose();}}>
          <ColorReferenceThumbnail image={image}/>
          <span className="color-reference-option-name">{index + 1} · {image.name}</span>
          {selected&&<CheckCircle className="color-reference-check" size={22} weight="fill" aria-hidden="true"/>}
        </button>;
      })}
      <button type="button" className="color-reference-option color-reference-upload" disabled={loading} onClick={() => input.current.click()}>
        <span className="color-reference-thumbnail">
          {loading ? <SpinnerGap className="spin" size={25} aria-hidden="true"/> : <UploadSimple size={25} aria-hidden="true"/>}
        </span>
        <span className="color-reference-option-name">{loading ? '正在读取…' : '上传参考图'}</span>
      </button>
    </div>
    <input ref={input} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="上传一张参考图" onChange={upload}/>
    {error&&<p className="dialog-error" role="alert">{error}</p>}
  </Modal>;
}
