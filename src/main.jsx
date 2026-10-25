import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { catalog } from './catalog.js';
import { createRackScene } from './scene.js';
import './styles.css';

function Arrow({direction='right'}) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={direction==='left'?'M19 12H5m6-6-6 6 6 6':'M5 12h14m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function App() {
  const canvasRef=useRef(null),sceneRef=useRef(null),closeRef=useRef(null),openerRef=useRef(null),actionsRef=useRef({});
  const [active,setActive]=useState(6),[hovered,setHovered]=useState(null),[mode,setMode]=useState('rack'),[turned,setTurned]=useState(false);
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[panel,setPanel]=useState(null);
  const item=catalog[active],focused=mode==='focus';
  function open(index=active){openerRef.current=document.activeElement;setActive(index);setMode('focus');setTurned(false);setHovered(null);}
  function close(){setMode('rack');setTurned(false);setHovered(active);requestAnimationFrame(()=>openerRef.current?.focus?.());}
  function step(direction){setActive(value=>{const next=(value+direction+catalog.length)%catalog.length;if(!focused)setHovered(next);return next;});setTurned(false);}
  actionsRef.current={onHover(index){if(!focused){setHovered(index);if(index!=null)setActive(index);}},onOpen:open,onStep:step};
  useEffect(()=>{
    let cancelled=false;
    createRackScene(canvasRef.current,catalog,{
      onHover:index=>actionsRef.current.onHover(index),onOpen:index=>actionsRef.current.onOpen(index),onStep:direction=>actionsRef.current.onStep(direction),
      onWarning:message=>console.warn('Garment asset:',message),onReady:()=>{if(!cancelled)setReady(true);},
    }).then(scene=>{if(cancelled)scene.dispose();else sceneRef.current=scene;}).catch(e=>{if(!cancelled){console.error('3D scene initialization failed:',e);setError('暂时无法开启 3D 展示');}});
    return()=>{cancelled=true;sceneRef.current?.dispose();sceneRef.current=null;};
  },[]);
  useEffect(()=>{sceneRef.current?.setState({active,hovered,mode,turned});},[active,hovered,mode,turned,ready]);
  useEffect(()=>{
    function keydown(event){if(panel)return;if(event.key==='ArrowRight'){event.preventDefault();step(1);}if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}if(event.key==='Escape'&&focused)close();if(event.key==='Enter'&&event.target===canvasRef.current&&!focused)open();}
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[active,mode,panel]);
  useEffect(()=>{if(focused)closeRef.current?.focus({preventScroll:true});},[mode]);
  return <main className="page">
    <section className={`showroom ${focused?'is-focused':''} ${ready?'is-ready':''}`} aria-label="有赞品牌影棚">
      <canvas ref={canvasRef} className="rack-canvas" tabIndex={0} aria-label="服装衣架：悬停展开，点击查看单品。左右方向键选款，回车查看，Esc 返回。"/>
      {focused&&<header className="masthead">
        <button ref={closeRef} className="icon-button close-button" aria-label="返回衣架" onClick={close}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg></button>
      </header>}
      {!ready&&!error&&<div className="loading" role="status" aria-label="加载中"><span className="loading-line"/></div>}
      {error&&<div className="webgl-error" role="alert"><p>{error}</p><button onClick={()=>window.location.reload()}>重新加载</button></div>}
      <div className="focus-navigation" aria-hidden={!focused}><button className="round-button" onClick={()=>step(-1)} tabIndex={focused?0:-1} aria-label="上一件衣服"><Arrow direction="left"/></button><button className="round-button" onClick={()=>step(1)} tabIndex={focused?0:-1} aria-label="下一件衣服"><Arrow/></button></div>
      <div className="rack-caption" aria-hidden={focused}>
        <button className="icon-button rack-step" onClick={()=>step(-1)} tabIndex={focused?-1:0} aria-label="选上一款"><Arrow direction="left"/></button>
        <button className="icon-button explore-button" onClick={()=>open()} disabled={!ready} tabIndex={focused?-1:0} aria-label="查看单品"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        <button className="icon-button rack-step" onClick={()=>step(1)} tabIndex={focused?-1:0} aria-label="选下一款"><Arrow/></button>
      </div>
      <div className="piece-caption" aria-hidden={!focused}>
        <button className="icon-button turn-button" onClick={()=>setTurned(!turned)} tabIndex={focused?0:-1} aria-label={turned?'查看正面':'转到背面'}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 7a6.5 5 0 1 1-1 5M1.5 7H5V3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      </div>
      <button className="credit-button" aria-label="模型署名" onClick={()=>setPanel('credits')}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor"/><path d="M10 9v5m0-8v.5" stroke="currentColor" strokeLinecap="round"/></svg></button>
    </section>
    {panel&&<InfoPanel onClose={()=>setPanel(null)}/>}
    <div className="sr-only" aria-live="polite">{focused?`单品：${item.name}，${turned?'背面':'正面'}`:`当前选款：${item.name}`}</div>
  </main>;
}
function InfoPanel({onClose}) {
  const ref=useRef(null);
  useEffect(()=>{const before=document.activeElement;ref.current?.focus();function key(event){if(event.key==='Escape')onClose();if(event.key==='Tab'){const controls=ref.current?.closest('[role=dialog]')?.querySelectorAll('button,a[href]');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);before?.focus?.();};},[]);
  return <div className="dialog-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="info-dialog" onClick={e=>e.stopPropagation()}><button ref={ref} className="icon-button dialog-close" onClick={onClose} aria-label="关闭署名"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg></button><h2 id="dialog-title">模型署名</h2><p>长袖模型<br/><a href="https://cgelves.com" target="_blank" rel="noreferrer">CG Elves / Camille Kleinman</a></p></section></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
