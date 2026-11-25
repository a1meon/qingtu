import {useMemo, useRef, useState} from 'react';
import {CheckCircle, Plus, SpinnerGap, X} from '@phosphor-icons/react';
import {Modal} from '../Modal.jsx';
import {hasImageColor} from '../../engine/image-color.mjs';
import {ColorLayer} from './ColorLayer.jsx';
import {colorPreviewWindow} from './color-preview.js';

export function ColorReferenceThumbnail({image, maxEdge = 192}) {
  const crop = useMemo(() => image.source ? colorPreviewWindow(image) : undefined, [image]);
  return <span className="color-reference-thumbnail" aria-hidden="true">
    {crop || hasImageColor(image.color)
      ? <ColorLayer preview={image.preview} color={image.color} crop={crop} maxEdge={maxEdge}/>
      : <img src={image.thumbnail || image.preview} alt="" draggable={false}/>}
  </span>;
}

function previewPosition(frame) {
  const gap = 12, inset = 12;
  const anchor = frame.getBoundingClientRect(), dialog = frame.closest('dialog').getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - inset * 2);
  const height = Math.min(280, window.innerHeight - inset * 2);
  const fit = (value, available, size) => Math.max(inset, Math.min(value, available - size - inset));
  const sides = [dialog.left - gap - width, dialog.right + gap];
  if (anchor.left + anchor.right > dialog.left + dialog.right) sides.reverse();
  const outside = sides.find(left => left >= inset && left + width <= window.innerWidth - inset);
  if (outside !== undefined) return {width,height,left:outside,top:fit(anchor.top,window.innerHeight,height)};
  const below = anchor.bottom + gap;
  return {width,height,left:fit(anchor.left,window.innerWidth,width),
    top:fit(below + height <= window.innerHeight - inset ? below : anchor.top - gap - height,window.innerHeight,height)};
}

export function ColorReferenceDialog({images, reference, onSelect, onImport, onClose}) {
  const input = useRef(), picking = useRef(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [hover, setHover] = useState(null);
  function showPreview(image, frame) {
    setHover({image, style: previewPosition(frame)});
  }
  async function upload(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file || picking.current) return;
    picking.current = true;
    setLoading(true);setError('');setHover(null);
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
    <div className="color-reference-grid" aria-busy={loading} onScroll={() => setHover(null)}>
      {images.map((image, index) => {
        const selected = reference?.id === image.id;
        return <button key={image.id} type="button" className="color-reference-option"
          aria-pressed={selected} disabled={loading} onClick={() => {onSelect({imageId: image.id});onClose();}}
          onFocus={event => {if (event.currentTarget.matches(':focus-visible')) showPreview(image,event.currentTarget.firstElementChild);}}
          onBlur={() => setHover(null)}>
          <span className="color-reference-frame" onPointerEnter={event => {
            if (event.pointerType === 'mouse') showPreview(image,event.currentTarget);
          }} onPointerLeave={() => setHover(null)}>
            <ColorReferenceThumbnail image={image}/>
            {selected&&<CheckCircle className="color-reference-check" size={20} weight="fill" aria-hidden="true"/>}
          </span>
          <span className="color-reference-option-name" title={image.name}>{index + 1} · {image.name}</span>
        </button>;
      })}
      <button type="button" className="color-reference-option color-reference-upload" disabled={loading} onClick={() => input.current.click()}>
        <span className="color-reference-frame">
          <span className="color-reference-thumbnail">
            {loading ? <SpinnerGap className="spin" size={25} aria-hidden="true"/> : <Plus size={26} aria-hidden="true"/>}
          </span>
        </span>
        <span className="color-reference-option-name">{loading ? '正在读取…' : '上传参考图'}</span>
      </button>
    </div>
    {hover&&!loading&&<div className="color-reference-hover" style={hover.style} aria-hidden="true">
      <ColorReferenceThumbnail key={hover.image.id} image={hover.image} maxEdge={480}/>
    </div>}
    <input ref={input} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="上传一张参考图" onChange={upload}/>
    {error&&<p className="dialog-error" role="alert">{error}</p>}
  </Modal>;
}
