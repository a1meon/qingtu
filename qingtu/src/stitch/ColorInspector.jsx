import {useEffect, useState} from 'react';
import {ArrowCounterClockwise, Plus, SpinnerGap} from '@phosphor-icons/react';
import {colorControls} from '../../engine/image-color.mjs';
import {ColorReferenceDialog, ColorReferenceThumbnail} from './ColorReferenceDialog.jsx';

function ColorSlider({label, value, min, max, step = 1, suffix = '', onChange, onCommit, onCancel, disabled, track}) {
  const [typed, setTyped] = useState(null);
  function typeValue(raw) {
    setTyped(raw);
    if (raw === '' || !Number.isFinite(Number(raw))) return;
    const bounded = Math.min(max, Math.max(min, Number(raw)));
    onChange(Number(bounded.toFixed(step < 1 ? 2 : 0)));
  }
  return <div className="color-slider">
    <span>{label}</span>
    <div className="color-number">
      <input type="number" min={min} max={max} step={step} aria-label={label + '数值'}
        value={typed ?? value} disabled={disabled} onFocus={event => event.currentTarget.select()}
        onChange={event => typeValue(event.currentTarget.value)}
        onBlur={event => {
          if (typed !== null && event.currentTarget.value === '') onCancel();
          else onCommit();
          setTyped(null);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {onCancel();setTyped(null);}
        }}/>
      {suffix&&<span aria-hidden="true">{suffix}</span>}
    </div>
    <input className="color-range" type="range" aria-label={label} aria-valuetext={value + suffix}
      value={value} min={min} max={max} step={step} disabled={disabled} data-track={track}
      style={{'--color-progress': (value - min) / (max - min) * 100 + '%'}}
      onChange={event => onChange(Number(event.target.value))}
      onPointerUp={onCommit} onPointerCancel={onCancel} onBlur={onCommit} onKeyUp={onCommit}/>
  </div>;
}

function imageLabel(image, images) {
  return (images.indexOf(image) + 1) + ' · ' + image.name;
}

export function ColorInspector({images, selected, draft, onDraft, onCommit, onCancel,
  onChange, onMatch, matching, matchMessage, disabled, reference, onReference, onImportReference}) {
  const [targetIds, setTargetIds] = useState(null);
  const [matchLuminance, setMatchLuminance] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => setTargetIds(null), [selected, reference?.id]);

  const current = images.find(image => image.id === selected);
  const chosen = images.filter(image => (targetIds || [selected]).includes(image.id)).map(image => image.id);
  const matchTargets = chosen.filter(id => id !== reference?.id);
  const syncTargets = chosen.filter(id => id !== selected);
  const color = draft?.id === selected ? draft.color : current?.color;
  const match = color?.match;
  const activeMatch = matchTargets.includes(selected) ? match : undefined;
  const luminance = activeMatch?.luminance ?? matchLuminance;
  const hasAdjustments = !!Object.keys(color?.adjustments || {}).length;

  function toggleTarget(id, checked) {
    setTargetIds(checked ? [...chosen, id] : chosen.filter(value => value !== id));
  }
  function syncColors() {
    onChange(new Map(images.filter(image => syncTargets.includes(image.id)).map(image =>
      [image.id, {...image.color, adjustments: color.adjustments}])));
  }

  return <div className="settings-scroll color-settings">
    <div className="color-current">
      <span title={current?.name}>{current ? imageLabel(current, images) : '选择画布中的图片'}</span>
    </div>
    <section className="control-section color-section" aria-label="色彩克隆">
      <h2>色彩克隆</h2>
      <button type="button" className="color-reference-trigger" disabled={disabled}
        aria-haspopup="dialog" aria-label={reference ? '更换参考图' : '添加参考图'} onClick={() => setChoosing(true)}>
        {reference&&<ColorReferenceThumbnail image={reference}/>}
        <span className="color-reference-trigger-name" title={reference?.name}>{reference?.name || '添加参考图'}</span>
        <Plus size={18} aria-hidden="true"/>
      </button>
      {choosing&&<ColorReferenceDialog images={images} reference={reference} onSelect={onReference} onImport={onImportReference} onClose={() => setChoosing(false)}/>}
      {reference&&<>
        <details className="color-targets">
          <summary>处理图片 <span>{matchTargets.length} 张</span></summary>
          <div className="color-target-list">
            {images.map(image => <label key={image.id} title={image.name}>
              <input type="checkbox" checked={matchTargets.includes(image.id)} disabled={disabled || image.id === reference.id}
                onChange={event => toggleTarget(image.id, event.target.checked)}/>
              <span>{imageLabel(image, images)}</span>
            </label>)}
          </div>
        </details>
        <label className="color-check">
          <input type="checkbox" checked={luminance} disabled={disabled} onChange={event => {
            const checked = event.target.checked;
            setMatchLuminance(checked);
            if (activeMatch) onChange(new Map([[selected, {...color, match: {...match, luminance: checked}}]]));
          }}/>
          同时匹配明暗
        </label>
        <button type="button" className="color-match-button" disabled={disabled || !matchTargets.length}
          onClick={() => onMatch(matchTargets, {luminance, strength: activeMatch?.strength ?? 70})}>
          {matching&&<SpinnerGap className="spin" size={15} aria-hidden="true"/>}
          {matching ? '正在克隆…' : matchTargets.length > 1 ? '克隆到 ' + matchTargets.length + ' 张图片' : '克隆整图色彩'}
        </button>
      </>}
      {match&&<ColorSlider key={selected} label="克隆强度" min={0} max={100} value={match.strength} suffix="%" disabled={disabled}
        onChange={strength => onDraft(selected, {...color, match: {...match, strength}})}
        onCommit={onCommit} onCancel={onCancel}/>}
      {matchMessage&&<p className={'color-hint' + (matchMessage.error ? ' color-error' : '')} role={matchMessage.error ? 'alert' : 'status'}>{matchMessage.text}</p>}
    </section>
    <section className="control-section color-section" aria-label="基础调色">
      <div className="color-section-heading">
        <h2>基础调色</h2>
        <button type="button" className="color-reset" disabled={disabled || !color} title="重置当前图片的调色"
          onClick={() => onChange(new Map([[selected, undefined]]))}>
          <ArrowCounterClockwise size={15} aria-hidden="true"/>重置全部
        </button>
      </div>
      {colorControls.map(({key, label, max, step}) => <ColorSlider key={selected + ':' + key} label={label} value={color?.adjustments?.[key] || 0}
        min={-max} max={max} step={step} disabled={disabled || !current} track={key}
        onChange={value => onDraft(selected, {...color, adjustments: {...color?.adjustments, [key]: value}})}
        onCommit={onCommit} onCancel={onCancel}/>)}
      {syncTargets.length > 0&&<button type="button" className="color-sync-button"
        disabled={disabled || !hasAdjustments} onClick={syncColors}>同步基础调色到 {syncTargets.length} 张</button>}
    </section>
  </div>;
}
