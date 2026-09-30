import { useEffect, useState } from 'react';
import ArrowDown from 'lucide-react/dist/esm/icons/arrow-down.js';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js';
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right.js';
import Check from 'lucide-react/dist/esm/icons/check.js';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import CircleHelp from 'lucide-react/dist/esm/icons/circle-help.js';
import Code2 from 'lucide-react/dist/esm/icons/code-2.js';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js';
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import LockKeyhole from 'lucide-react/dist/esm/icons/lock-keyhole.js';
import Monitor from 'lucide-react/dist/esm/icons/monitor.js';
import MoreHorizontal from 'lucide-react/dist/esm/icons/more-horizontal.js';
import PanelRightClose from 'lucide-react/dist/esm/icons/panel-right-close.js';
import Play from 'lucide-react/dist/esm/icons/play.js';
import Plus from 'lucide-react/dist/esm/icons/plus.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js';
import Tablet from 'lucide-react/dist/esm/icons/tablet.js';
import WandSparkles from 'lucide-react/dist/esm/icons/wand-sparkles.js';
import X from 'lucide-react/dist/esm/icons/x.js';

type Analysis = { url: string; title: string; description: string; text: string; headings: string[]; links: {label:string;href:string}[]; images: {src:string;alt:string}[]; colors:string[]; fonts:string[]; screenshot:string; sections:{heading:string;text:string}[] };
type ApiError = { error?: string };
const starters = ['https://linear.app', 'https://www.notion.so', 'https://stripe.com'];

async function api<T>(path:string, body?:unknown):Promise<T> {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? {'content-type':'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export default function App() {
  const [url,setUrl]=useState(''); const [analysis,setAnalysis]=useState<Analysis|null>(null); const [html,setHtml]=useState(''); const [busy,setBusy]=useState<'analyze'|'generate'|'modify'|null>(null); const [error,setError]=useState(''); const [mode,setMode]=useState<'ai'|'fallback'|null>(null); const [device,setDevice]=useState<'desktop'|'tablet'|'mobile'>('desktop'); const [tab,setTab]=useState<'preview'|'code'>('preview'); const [prompt,setPrompt]=useState(''); const [showDetails,setShowDetails]=useState(false); const [health,setHealth]=useState<{aiConfigured:boolean;model:string}|null>(null); const [revision,setRevision]=useState(0);
  useEffect(()=>{api<{aiConfigured:boolean;model:string}>('/api/health').then(setHealth).catch(()=>setHealth({aiConfigured:false,model:'unavailable'}));},[]);
  const run = async () => { setError('');setHtml('');setAnalysis(null);setBusy('analyze');try{const data=await api<Analysis>('/api/analyze',{url:url.trim()});setAnalysis(data);setBusy('generate');const generated=await api<{html:string;mode:'ai'|'fallback'}>('/api/generate',{analysis:data});setHtml(generated.html);setMode(generated.mode);setTab('preview');setRevision(0);}catch(e){setError(e instanceof Error?e.message:'Something went wrong.');}finally{setBusy(null);} };
  const modify = async (instruction:string) => {if(!html||!instruction.trim())return;setBusy('modify');setError('');try{const data=await api<{html:string}>('/api/modify',{html,instruction});setHtml(data.html);setPrompt('');setRevision(x=>x+1);setTab('preview');}catch(e){setError(e instanceof Error?e.message:'Could not apply that change.');}finally{setBusy(null);}};
  const busyLabel = busy==='analyze'?'Reading the page…':busy==='generate'?'Building your site…':busy==='modify'?'Applying your edit…':'';
  const width = device==='desktop'?'100%':device==='tablet'?'768px':'390px';
  return <div className="app-shell">
    <header className="topbar"><a className="wordmark" href="#"><span className="logo-mark"><span/><span/><span/><span/></span><span>sitecraft</span><span className="wordmark-ai">AI</span></a><div className="top-center"><span className="status-dot"/>{health?.aiConfigured?'AI connected':health?'Local mode':'Connecting'}<span className="top-divider"/> <span>{health?.aiConfigured?health.model:'Ready to build'}</span></div><div className="top-actions"><button className="icon-btn subtle" title="Help"><CircleHelp size={17}/></button><button className="avatar" aria-label="Account">S</button></div></header>
    <main className="workspace">
      <aside className="sidebar">
        <div className="side-head"><div><p className="eyebrow">YOUR WORKSPACE</p><button className="project-select">Untitled project <ChevronDown size={15}/></button></div><button className="icon-btn" title="New project" onClick={()=>{setUrl('');setAnalysis(null);setHtml('');setError('')}}><Plus size={18}/></button></div>
        <div className="new-project-card"><div className="spark-icon"><Sparkles size={17}/></div><div><strong>New website</strong><span>Start from any URL</span></div></div>
        <div className="flow-label">BUILD FLOW</div>
        <div className="steps">
          <div className={`step ${analysis?'done':busy==='analyze'?'active':''}`}><div className="step-icon">{analysis?<Check size={15}/>:busy==='analyze'?<LoaderCircle size={15} className="spin"/>:<Globe2 size={15}/>}</div><div><strong>Analyze website</strong><span>{analysis?'Page structure captured':busy==='analyze'?'Inspecting layout & content':'Read the original page'}</span></div></div>
          <div className={`step-line ${html?'done':''}`}/>
          <div className={`step ${html?'done':busy==='generate'?'active':''}`}><div className="step-icon">{html?<Check size={15}/>:busy==='generate'?<LoaderCircle size={15} className="spin"/>:<WandSparkles size={15}/>}</div><div><strong>Generate frontend</strong><span>{html?'Responsive UI created':busy==='generate'?'Writing your frontend':'Build a new implementation'}</span></div></div>
          <div className={`step-line ${html?'done':''}`}/>
          <div className={`step ${html?'ready':''}`}><div className="step-icon"><Play size={13} fill="currentColor"/></div><div><strong>Preview & refine</strong><span>{html?'Make it yours with a prompt':'See and edit your result'}</span></div></div>
        </div>
        <div className="source-label">SOURCE WEBSITE</div>
        <form className="url-form" onSubmit={e=>{e.preventDefault();if(!busy&&url.trim())void run();}}><div className="url-field"><Globe2 size={16}/><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Paste a website URL" aria-label="Website URL"/><button type="button" className="clear-url" onClick={()=>setUrl('')} title="Clear URL">{url?<X size={14}/>:null}</button></div><button className="build-btn" disabled={!url.trim()||Boolean(busy)}>{busy?<><LoaderCircle size={16} className="spin"/>{busyLabel}</>:<><Sparkles size={16}/> Build website <ArrowRight size={16}/></>}</button></form>
        <div className="examples"><span>Try a website</span>{starters.map(s=><button key={s} onClick={()=>setUrl(s)}>{s.replace(/^https:\/\/(www\.)?/,'')}<ArrowUpRight size={12}/></button>)}</div>
        <div className="side-spacer"/><div className="privacy-note"><LockKeyhole size={14}/><span>Your pages are processed locally.<br/>No projects are stored.</span></div>
        <div className="sidebar-footer"><span>Sitecraft beta</span><span>v1.0.0</span></div>
      </aside>
      <section className="main-panel">
        <div className="panel-header"><div className="breadcrumbs"><span>Workspace</span><ChevronDown size={13} className="crumb-chevron"/><strong>{analysis?new URL(analysis.url).hostname:'Untitled project'}</strong></div><div className="header-ops"><button className="secondary-btn" disabled={!html} onClick={()=>setShowDetails(v=>!v)}><Code2 size={15}/> Details</button><button className="primary-small" disabled={!html} onClick={()=>{if(html){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download='sitecraft-preview.html';a.click();URL.revokeObjectURL(a.href)}}}><ArrowDown size={15}/> Export</button></div></div>
        <div className="canvas-toolbar"><div className="canvas-tabs"><button className={tab==='preview'?'selected':''} onClick={()=>setTab('preview')}><Monitor size={15}/> Preview</button><button className={tab==='code'?'selected':''} onClick={()=>setTab('code')} disabled={!html}><Code2 size={15}/> Code</button></div><div className="device-tools"><div className="device-switch"><button title="Desktop" className={device==='desktop'?'active':''} onClick={()=>setDevice('desktop')}><Monitor size={15}/></button><button title="Tablet" className={device==='tablet'?'active':''} onClick={()=>setDevice('tablet')}><Tablet size={15}/></button><button title="Mobile" className={device==='mobile'?'active':''} onClick={()=>setDevice('mobile')}><Smartphone size={15}/></button></div>{analysis&&<span className="viewport-label">{device==='desktop'?'1440':device==='tablet'?'768':'390'} px</span>}<button className="icon-btn" title="Reload preview" disabled={!html} onClick={()=>setRevision(x=>x+1)}><RefreshCw size={15}/></button><button className="icon-btn" title="Open source website" disabled={!analysis} onClick={()=>analysis&&window.open(analysis.url,'_blank','noopener,noreferrer')}><ExternalLink size={15}/></button><button className="icon-btn" title="More options"><MoreHorizontal size={17}/></button></div></div>
        <div className={`canvas ${html?'has-preview':''}`}>
          {busy&&<div className="progress-banner"><LoaderCircle size={17} className="spin"/><span>{busyLabel}</span><div className="progress-track"><i/></div></div>}
          {error&&<div className="error-banner"><span className="error-symbol">!</span><div><strong>We couldn’t finish that step</strong><span>{error}</span></div><button className="icon-btn" onClick={()=>setError('')}><X size={16}/></button></div>}
          {!html?<div className="welcome-stage"><div className="welcome-orbit orbit-one"/><div className="welcome-orbit orbit-two"/><div className="welcome-card"><div className="welcome-eyebrow"><span className="pulse-dot"/> YOUR NEXT WEBSITE STARTS HERE</div><div className="welcome-title">From link to<br/><em>launch-ready.</em></div><p>Paste any website URL and watch Sitecraft turn it into a fresh, editable frontend in minutes.</p><div className="mini-process"><span><Globe2 size={14}/> Analyze</span><ArrowRight size={14}/><span><Sparkles size={14}/> Generate</span><ArrowRight size={14}/><span><Play size={12}/> Preview</span></div><div className="welcome-hint">Start by adding a URL in the left panel <ArrowLeft size={14}/></div></div><div className="floating-chip chip-a"><span className="chip-check"><Check size={12}/></span> Responsive by default</div><div className="floating-chip chip-b"><span className="chip-spark"><Sparkles size={12}/></span> Make it yours</div><div className="canvas-caption"><span>WORKSPACE PREVIEW</span><span>Secure sandbox · Local session</span></div></div>:tab==='preview'?<div className="preview-surround"><div className={`browser-bar ${device!=='desktop'?'narrow':''}`} style={{width}}><div className="browser-dots"><i/><i/><i/></div><div className="address-pill"><LockKeyhole size={11}/><span>{analysis?new URL(analysis.url).hostname:'preview.sitecraft.local'}</span></div><div className="browser-more"><RefreshCw size={12}/></div></div><div className={`iframe-wrap device-${device}`} style={{width}}><iframe key={revision} title="Generated website preview" sandbox="allow-scripts allow-forms allow-popups" srcDoc={html} /></div>{mode&&<div className="generation-note"><span className={mode==='ai'?'ai-dot':'local-dot'}/>{mode==='ai'?'AI generated':'Local starter'} <span>·</span> {revision?`Edit ${revision}`:'First draft'}</div>}</div>:<pre className="code-view"><code>{html}</code></pre>}
        </div>
        {html&&<div className="prompt-dock"><div className="prompt-label"><Sparkles size={14}/><span>REFINE YOUR WEBSITE</span><span className="prompt-hint">Describe a change in plain English</span></div><form className="prompt-form" onSubmit={e=>{e.preventDefault();void modify(prompt)}}><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void modify(prompt)}}} placeholder="e.g. Make the navigation sticky and switch the accent to forest green" maxLength={500}/><button disabled={!prompt.trim()||busy==='modify'} title="Apply change">{busy==='modify'?<LoaderCircle size={17} className="spin"/>:<ArrowRight size={17}/>}</button></form><div className="suggestions">{['Make it more minimal','Add a testimonials section','Use a warmer color palette'].map(t=><button key={t} onClick={()=>{setPrompt(t);void modify(t)}} disabled={Boolean(busy)}><Plus size={12}/>{t}</button>)}</div></div>}
        {showDetails&&analysis&&<div className="details-drawer"><div className="drawer-head"><strong>Website analysis</strong><button className="icon-btn" onClick={()=>setShowDetails(false)}><PanelRightClose size={17}/></button></div><img className="source-shot" src={analysis.screenshot} alt="Screenshot of source website"/><div className="detail-block"><span>PAGE TITLE</span><p>{analysis.title}</p></div><div className="detail-block"><span>SECTIONS FOUND · {analysis.sections.length}</span>{analysis.headings.slice(0,8).map((h,i)=><p className="outline-item" key={`${h}-${i}`}><span>{String(i+1).padStart(2,'0')}</span>{h}</p>)}</div><div className="detail-block"><span>IMAGES · {analysis.images.length}</span>{analysis.images.slice(0,6).map(x=><p key={x.src} className="image-item">{x.alt||new URL(x.src).pathname.split('/').pop()}</p>)}</div><div className="detail-block"><span>PALETTE</span><div className="palette">{analysis.colors.slice(0,7).map(c=><i title={c} key={c} style={{background:c}}/>)}</div></div></div>}
      </section>
    </main>
  </div>;
}
