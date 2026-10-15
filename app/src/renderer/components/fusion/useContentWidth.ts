/* FloatIsland - https://github.com/yanhaoran01/FloatIsland; Copyright (C) 2026 contributors. GPL-3.0. */
/** @file useContentWidth.ts @description Measures the real content box rather than monitor or viewport guesses. @author 鸡哥 */
import {useCallback,useEffect,useState} from 'react';
/** 观察可见内容宽度；仅判断布局时避免拖动的每个像素都重渲染设置。
 * @param trackWidth - 是否保留精确宽度；false 只在 640px 断点变化时更新。
 * @returns 容器引用、宽度及窄布局状态。
 */
export function useContentWidth<T extends HTMLElement>(trackWidth=true){
  const [node,setNode]=useState<T|null>(null),[width,setWidth]=useState(0);
  const ref=useCallback((element:T|null)=>setNode(element),[]);
  useEffect(()=>{
    if(!node)return;
    const observer=new ResizeObserver(([entry])=>{
      const measured=entry.contentRect.width;
      if(measured>0)setWidth(trackWidth?Math.round(measured):measured<640?639:640);
    });
    observer.observe(node);
    return()=>observer.disconnect();
  },[node,trackWidth]);
  return {ref,width,narrow:width>0&&width<640};
}
