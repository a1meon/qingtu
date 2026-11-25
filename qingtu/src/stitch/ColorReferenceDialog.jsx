import {useId, useMemo, useRef, useState} from 'react';
import {Check, Plus, SpinnerGap, X} from '@phosphor-icons/react';
import {Modal} from '../Modal.jsx';
import {hasImageColor} from '../../engine/image-color.mjs';
import {ColorLayer} from './ColorLayer.jsx';
import {colorPreviewWindow} from './color-preview.js';

export function ColorReferenceThumbnail({image, maxEdge = 192, graded = true, detail = false}) {
  const crop = useMemo(() => image.source ? colorPreviewWindow(image) : undefined, [image]);
  const color=graded?image.color:undefined;
  return <span className="color-reference-thumbnail" aria-hidden="true">
    {crop || hasImageColor(color)
      ? <ColorLayer preview={image.preview} color={color} crop={crop} maxEdge={maxEdge}/>
      : <img src={(detail && image.preview) || image.thumbnail || image.preview} alt="" draggable={false}/>}
  </span>;
}

export function colorPreviewPosition(element) {
  const inset = 8, gap = 8, anchor = element.getBoundingClientRect();
  const above = anchor.top - gap - inset, below = window.innerHeight - anchor.bottom - gap - inset;
  const useAbove = above >= 105 || above >= below;
  const size = Math.min(240, window.innerWidth - 2 * inset, useAbove ? above : below);
  if (size < 1) return null;
  const left = Math.max(inset, Math.min(anchor.left + (anchor.width - size) / 2, window.innerWidth - size - inset));
  return {width:size,height:size,left,top:useAbove ? anchor.top - gap - size : anchor.bottom + gap};
}

export function ColorHoverPreview({image, style}) {
  return <div className="color-reference-hover" style={style} aria-hidden="true">
    <ColorReferenceThumbnail key={image.id || image.name} image={image} maxEdge={480} detail/>
  </div>;
}

export function ColorClonePicker({images, reference, targets, onApply, onImport, onClose}) {
  const sourceHeading = useId(), targetHeading = useId();
  const input = useRef(), picking = useRef(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [source, setSource] = useState(reference);
  const [uploaded, setUploaded] = useState(reference?.id ? null : reference);
  const [chosen, setChosen] = useState(targets);
  const options = images.map((image,index) => ({image,index}));
  const targetOptions = options.filter(({image}) => image.id !== source?.id);
  const eligible = targetOptions.map(({image}) => image.id);
  const selectedTargets = eligible.filter(id => chosen.includes(id));
  const allSelected = eligible.length > 0 && selectedTargets.length === eligible.length;

  function renderCard(image, index, isReference) {
    const isSource = image.id ? image.id === source?.id : image === source;
    const checked = isReference ? isSource : selectedTargets.includes(image.id);
    return <button key={image.id || 'uploaded'} type="button" className="color-reference-option"
      aria-pressed={checked} disabled={loading}
      onClick={() => isReference ? setSource(image) :
        setChosen(ids => checked ? ids.filter(id => id !== image.id) : [...ids,image.id])}>
      <span className="color-reference-frame">
        <ColorReferenceThumbnail image={image} maxEdge={120} graded={isReference && isSource}/>
        {isSource ? <span className="color-picker-badge">参考图</span> :
          !isReference&&<span className="color-picker-check" aria-hidden="true">{checked&&<Check size={14} weight="bold"/>}</span>}
      </span>
      <span className="color-reference-option-name" title={image.name}>{image.id ? `${index + 1} · ` : ''}{image.name}</span>
    </button>;
  }
  async function upload(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file || picking.current) return;
    picking.current = true;
    setLoading(true);setError('');
    try {
      const image = await onImport(file);
      setUploaded(image);setSource(image);
    } catch (error) {
      setError(error.message);
    } finally {
      picking.current = false;
      setLoading(false);
    }
  }
  return <Modal label="色彩克隆选图" className="color-reference-dialog" onCancel={loading ? undefined : onClose}>
    <header className="color-reference-dialog-header">
      <h2>色彩克隆选图</h2>
      <button type="button" className="icon-button" aria-label="取消选图" disabled={loading} onClick={onClose}>
        <X size={17} aria-hidden="true"/>
      </button>
    </header>
    <div className="color-picker-body" aria-busy={loading}>
      <section className="color-picker-section" aria-labelledby={sourceHeading}>
        <div className="color-picker-tools">
          <h3 id={sourceHeading}>参考图片</h3>
          <button type="button" className="color-picker-action" disabled={loading} onClick={() => input.current.click()}>
            {loading ? <SpinnerGap className="spin" size={15}/> : <Plus size={15}/>}
            {loading ? '正在读取…' : '上传参考图'}
          </button>
        </div>
        {(uploaded || images.length > 0)&&<div className="color-reference-grid color-reference-sources">
          {uploaded&&renderCard(uploaded,0,true)}
          {options.map(({image,index}) => renderCard(image,index,true))}
        </div>}
        {error&&<p className="dialog-error" role="alert">{error}</p>}
      </section>
      <section className="color-picker-section" aria-labelledby={targetHeading}>
        <div className="color-picker-tools">
          <h3 id={targetHeading}>处理图片</h3>
          <button type="button" className="color-picker-action" disabled={loading || !eligible.length}
            onClick={() => setChosen(allSelected ? [] : eligible)}>{allSelected ? '清空' : '全选'}</button>
        </div>
        {targetOptions.length > 0&&<div className="color-reference-grid color-reference-targets">
          {targetOptions.map(({image,index}) => renderCard(image,index,false))}
        </div>}
      </section>
    </div>
    <footer className="stitch-dialog-actions color-picker-footer">
      <span role="status">{eligible.length ? `已选 ${selectedTargets.length} / ${eligible.length} 张处理图片` : '没有可处理的图片'}</span>
      <button type="button" className="dialog-confirm color-picker-confirm" disabled={loading || !source}
        onClick={() => onApply(source,selectedTargets)}>完成</button>
    </footer>
    <input ref={input} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="上传一张参考图" onChange={upload}/>
  </Modal>;
}
