import {Question} from '@phosphor-icons/react';
import {TooltipButton} from './TooltipButton.jsx';
import {encodingLabel,formatFileSize,sizeChangeLabel,sizeIncreaseHint} from './export-format.js';

const dimensionsText=({width,height})=>`${width} × ${height}`;

export function PreviewMetrics({dimensions,dimensionLabel='原图',sourceBytes,sources=[],output,processing=false,status,multiple=false,selectedImage}){
 const changed=dimensions&&output&&(output.width!==dimensions.width||output.height!==dimensions.height);
 const dimensionHint=dimensions&&[
  `${dimensionLabel} ${dimensionsText(dimensions)} px`,
  changed&&`导出 ${dimensionsText(output)} px`,
 ].filter(Boolean).join(' · ');
 const sizeHint=sourceBytes!=null&&[
  `${multiple?'原图合计':'原图'} ${sourceBytes.toLocaleString()} 字节`,
  output&&`导出 ${output.bytes.toLocaleString()} 字节`,
  multiple&&selectedImage&&`选中原图 ${selectedImage.name} · ${formatFileSize(selectedImage.bytes)}`,
 ].filter(Boolean).join(' · ');
 return <>
  {dimensions&&<span className="preview-dimensions" title={dimensionHint}>
   {dimensionsText(dimensions)}{changed&&<> → {dimensionsText(output)}</>} px
  </span>}
  {sourceBytes!=null&&<span className="size-comparison">
   {output&&<><span className="preview-status" title={output.unchanged?'原文件直接导出':output.encoding}>{encodingLabel(output)}</span> · </>}
   <span className="size-pair" title={sizeHint}>{formatFileSize(sourceBytes)} → {output?formatFileSize(output.bytes):processing?'计算中…':status||'—'}</span>
   {output&&<> · <strong>{sizeChangeLabel(sourceBytes,output.bytes)}</strong></>}
   {output?.bytes>sourceBytes&&<TooltipButton label="为什么体积增加了？" hint={sizeIncreaseHint(sources,output)} placement="top" className="size-help">
    <Question size={14} weight="bold" aria-hidden/>
   </TooltipButton>}
  </span>}
 </>;
}
