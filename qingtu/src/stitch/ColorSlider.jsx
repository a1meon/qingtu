import {useState} from 'react';

export function ColorSlider({label, value, min, max, step = 1, suffix = '', onChange, onCommit, onCancel, disabled, track}) {
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
      style={{'--color-progress': (value - min) / (max - min) * 100 + '%', '--color-zero': min < 0 ? '50%' : '0%'}}
      onChange={event => onChange(Number(event.target.value))}
      onPointerUp={onCommit} onPointerCancel={onCancel} onBlur={onCommit} onKeyUp={onCommit}/>
  </div>;
}
