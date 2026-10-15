/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file QrTool.tsx @description 二维码生成、文件和粘贴图像识别。 @author 鸡哥 */
import { useEffect, useRef, useState } from 'react';
import {Copy,Download,ImagePlus,QrCode,ScanLine,X} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import jsQR from 'jsqr';
import {useProductFiles} from '../productStore';
import { ToolBody, ToolResult,ToolTabs } from './ToolControls';
import { downloadToolFile } from './toolHelpers';

/** 本地二维码往返；图片识别不上传到网络。 */
export function QrTool() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [decoded, setDecoded] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode,setMode]=useState<'generate'|'recognize'>('generate'),[template,setTemplate]=useState('text'),[ssid,setSsid]=useState(''),[wifiPassword,setWifiPassword]=useState(''),[wifiType,setWifiType]=useState('WPA'),[wifiHidden,setWifiHidden]=useState(false);
  const escapeWifi=(value:string)=>value.replace(/[\\;,:\"]/g,'\\$&');
  const content=template==='wifi'?'WIFI:T:'+wifiType+';S:'+escapeWifi(ssid)+';P:'+escapeWifi(wifiPassword)+';H:'+wifiHidden+';;':text;
  const qr = useRef<HTMLDivElement>(null),imageInput=useRef<HTMLInputElement>(null);
  const [imagePreview,setImagePreview]=useState('');
  useEffect(()=>()=>{if(imagePreview)URL.revokeObjectURL(imagePreview);},[imagePreview]);
  const generation = useRef(0);
  useProductFiles('qr',files=>{const file=files[0];if(file?.type.startsWith('image/'))void read(file);else if(file)void file.text().then(value=>{setText(value);setTemplate('text');setMode('generate');}).catch(reason=>setError(String(reason)));});
  const hasContent = template==='wifi'?Boolean(ssid.trim()):Boolean(text.trim());
  const valid = new TextEncoder().encode(content).length <= 2000;
  const read = async (file?: File): Promise<void> => {
    if (!file) return;
    const current = ++generation.current;
    setMode('recognize');
    setBusy(true); setError(''); setDecoded('');
    try {
      if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('invalid-image');
      setImagePreview(URL.createObjectURL(file));
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('invalid-image');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (!result) throw new Error('qr-not-found');
        if (current === generation.current) setDecoded(result.data);
      } finally { bitmap.close(); }
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const save = async (format: 'svg' | 'png'): Promise<void> => {
    const svg = qr.current?.querySelector('svg'); if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    if (format === 'svg') { downloadToolFile('qrcode.svg', xml, 'image/svg+xml'); return; }
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 768;
      canvas.getContext('2d')?.drawImage(image, 0, 0, 768, 768);
      canvas.toBlob(blob => { if (blob) downloadToolFile('qrcode.png', blob, 'image/png'); });
    } catch (reason) { setError(String(reason)); } finally { URL.revokeObjectURL(url); }
  };
  const screenshot=async()=>{setError('');try{const artifact=await window.api.fusionProductCapture({mode:'region'}),file=await window.api.fusionProductRead(artifact.id);await read(new File([new Uint8Array(file.bytes)],artifact.name,{type:artifact.mime}));}catch(reason){if(!String(reason).includes('capture-cancelled'))setError(String(reason));}};
  return <div className="float-qr-workspace" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();event.stopPropagation();void read(event.dataTransfer.files[0]);}} onPaste={event=>{const file=[...event.clipboardData.items].find(item=>item.type.startsWith('image/'))?.getAsFile();if(file){event.preventDefault();void read(file);}}}>
    <ToolBody busy={busy} cancel={()=>{generation.current++;setBusy(false);}} error={mode==='generate'&&!valid?'qr-too-long':error}>
      <ToolTabs>{(['generate','recognize'] as const).map(id=><button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)}>{t('fusion.enhance.qr.'+id)}</button>)}</ToolTabs>
      <div className="float-qr-layout" hidden={mode!=='generate'}>
        <section className="float-qr-input">
          <header><strong>{t('fusion.ui.qrContent')}</strong><div className="float-qr-templates">{['text','url','wifi'].map(id=><button key={id} aria-pressed={template===id} onClick={()=>setTemplate(id)}>{t('fusion.enhance.qr.'+id)}</button>)}</div></header>
          {template==='wifi'?<div className="float-qr-wifi">
            <label>Wi-Fi SSID<input value={ssid} onChange={event=>setSsid(event.target.value)} autoComplete="off"/></label>
            <label>{t('fusion.enhance.qr.password')}<input type="password" value={wifiPassword} onChange={event=>setWifiPassword(event.target.value)} autoComplete="new-password"/></label>
            <div className="float-qr-security"><select aria-label={t('fusion.enhance.qr.security')} value={wifiType} onChange={event=>setWifiType(event.target.value)}><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">{t('fusion.enhance.qr.open')}</option></select><label><input type="checkbox" checked={wifiHidden} onChange={event=>setWifiHidden(event.target.checked)}/>{t('fusion.enhance.qr.hidden')}</label></div>
          </div>:<textarea maxLength={1800} aria-label={t('fusion.toolbox.qr.text')} placeholder={t(template==='url'?'fusion.ui.qrUrlPlaceholder':'fusion.ui.qrTextPlaceholder')} value={text} onChange={event=>setText(event.target.value)}/>}
          <footer><button type="button" disabled={!content} onClick={()=>{setText('');setSsid('');setWifiPassword('');setError('');}}><X size={14}/>{t('fusion.toolbox.clear')}</button><small>{t('fusion.ui.qrBytes',{count:new TextEncoder().encode(content).length})}</small></footer>
        </section>
        <section className="float-qr-output">
          <header><strong>{t('fusion.ui.preview')}</strong></header>
          <div className="float-qr-preview" ref={qr}>{hasContent&&valid?<QRCodeSVG value={content} size={208} marginSize={4} level="M"/>:<div className="float-qr-placeholder"><QrCode size={48} strokeWidth={1}/></div>}</div>
          <div className="float-qr-export"><button className="float-primary-action" disabled={!hasContent||!valid} onClick={()=>void save('png')}><Download size={15}/>{t('fusion.product.save')} PNG</button><button disabled={!hasContent||!valid} onClick={()=>void save('svg')}>SVG</button><button className="fusion-icon-button" aria-label={t('fusion.toolbox.copy')} title={t('fusion.toolbox.copy')} disabled={!hasContent||!valid} onClick={()=>void navigator.clipboard.writeText(content).catch(reason=>setError(String(reason)))}><Copy size={15}/></button></div>
        </section>
      </div>
      <div className="float-qr-layout" hidden={mode!=='recognize'}>
        <section className="float-qr-input float-qr-image-input">
          <header><strong>{t('fusion.toolbox.items.image')}</strong><span className="float-qr-image-actions"><button disabled={busy} onClick={()=>imageInput.current?.click()}><ImagePlus size={15}/>{t('fusion.ui.importImage')}</button><button disabled={busy} onClick={()=>void screenshot()}><ScanLine size={15}/>{t('fusion.enhance.qr.screenshot')}</button></span></header>
          <input ref={imageInput} type="file" accept="image/*" hidden onChange={event=>{void read(event.target.files?.[0]);event.target.value='';}}/>
          <button className="float-qr-image-zone" disabled={busy} onClick={()=>imageInput.current?.click()}>{imagePreview?<img src={imagePreview} alt={t('fusion.ui.preview')}/>:<><ImagePlus size={32} strokeWidth={1.2}/><span>{t('fusion.ui.importImage')}</span></>}</button>
        </section>
        <section className="float-qr-output float-qr-read-result"><header><strong>{t('fusion.ui.qrResult')}</strong></header>{decoded?<ToolResult text={decoded}/>:<div className="float-qr-result-placeholder"><ScanLine size={28} strokeWidth={1.2}/></div>}</section>
      </div>
    </ToolBody>
  </div>;
}
