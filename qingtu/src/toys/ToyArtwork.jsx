import {createElement} from 'react';
import {WarningCircle} from '@phosphor-icons/react';
import catalog from '../../desktop/toy-catalog.json';
import {TOY_ELEMENTS} from './qingtu-toys.js';

// 轻图's own toys are bundled custom elements, registered on import.
export function ToyArtwork({kind}){
 const item=catalog.find(item=>item.id===kind),tag=item&&TOY_ELEMENTS[item.id];
 if(!tag)return <span className="toy-art-status" role="alert" title="玩具不可用">
  <WarningCircle size={20} aria-hidden="true"/><span className="sr-only">玩具不可用</span>
 </span>;
 return createElement(tag,{className:'toy-artwork',label:item.name});
}
