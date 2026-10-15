/* FusionIsland - GPL-3.0. @file ProductSettings.tsx @description Persisted unified search shortcut. @author 鸡哥 */
import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ToolError} from './tools/ToolControls';
import {ShortcutInput} from './ShortcutInput';
/** Saves a shortcut only after successful native registration. */
export function ProductSettings(){
 const {t}=useTranslation(),[key,setKey]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{void window.api.fusionProductData().then(data=>{setKey(data.hotkey);setError(data.hotkeyError??'');}).catch(reason=>setError(String(reason)));},[]);
 return <div className="fusion-settings-card"><div className="fusion-setting-row"><span>{t('fusion.product.hotkey')}</span><ShortcutInput label={t('fusion.product.hotkey')} value={key} onChange={value=>{setKey(value);setSaved(false);}}/></div><button onClick={()=>{void window.api.fusionProductData().then(data=>window.api.fusionProductWrite({...data,hotkey:key},true)).then(()=>{setError('');setSaved(true);}).catch(reason=>setError(String(reason)));}}>{t('fusion.product.hotkeySave')}</button>{saved&&<p role="status">{t('fusion.product.hotkeySaved')}</p>}<ToolError error={error}/></div>;
}
