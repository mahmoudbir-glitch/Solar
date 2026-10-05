'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {Battery,Home,Settings,Zap,Wallet,LogOut,Circle,Sun,Grid3X3} from 'lucide-react';
import type {Telemetry} from '@/lib/types';
import {emptyTelemetry} from '@/lib/types';

const items=[
 ['/','الرئيسية',Grid3X3,'main'],
 ['/home','المنزل',Home,'home'],
 ['/battery','البطارية',Battery,'battery'],
 ['/energy','الطاقة',Zap,'energy'],
 ['/money','المال',Wallet,'money'],
 ['/settings','الإعدادات',Settings,'settings'],
] as const;

const colors:{[key:string]:string}={main:'#8B5CF6',home:'#0EA5E9',battery:'#10B981',energy:'#F59E0B',money:'#14B8A6',settings:'#E11D48'};

function formatReadingTime(timestamp:string|null){
 if(!timestamp)return '';
 const date=new Date(timestamp);
 if(Number.isNaN(date.getTime()))return '';
 return new Intl.DateTimeFormat('ar-LB',{hour:'2-digit',minute:'2-digit',hour12:true}).format(date);
}

export function Header(){
 const router=useRouter();
 const [isConnected,setIsConnected]=useState(false);
 const [lastReading,setLastReading]=useState<string|null>(null);

 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    const response=await fetch('/api/telemetry',{cache:'no-store'});
    if(!response.ok)throw new Error(`Telemetry request failed: ${response.status}`);
    const data:Telemetry=await response.json();
    if(!active)return;
    const healthy=data.source==='gateway'&&Boolean(data.timestamp);
    setIsConnected(healthy);
    setLastReading(healthy?data.timestamp:null);
   }catch{
    if(!active)return;
    setIsConnected(false);
    setLastReading(null);
   }
  };
  load();
  const id=window.setInterval(load,10000);
  return()=>{active=false;window.clearInterval(id)};
 },[]);

 async function logout(){await fetch('/api/auth/logout',{method:'POST'});router.replace('/login');router.refresh();}
 const readingTime=formatReadingTime(lastReading);

 return <header className="app-header" dir="rtl">
  <div className="brand">
   <div className="brand-mark"><Sun size={24} strokeWidth={2.4}/></div>
   <div className="brand-copy">
    <div className="brand-name">Solar</div>
    <div className="brand-tag">الشمس تعمل من أجلك</div>
    {isConnected&&readingTime&&<div className="last-reading" aria-live="polite">
     <Circle size={7} fill="currentColor" aria-hidden="true"/>
     <span>آخر قراءة: {readingTime}</span>
    </div>}
   </div>
  </div>
  <div className="header-actions">
   <button className="logout-button" type="button" aria-label="تسجيل الخروج" onClick={logout}><LogOut size={18}/><span>تسجيل الخروج</span></button>
  </div>
 </header>;
}

export function Nav(){
 const pathname=usePathname();
 return <nav className="bottom-nav" dir="rtl" aria-label="التنقل الرئيسي"><div className="nav-inner">{items.map(([href,label,Icon,key])=>{const active=href==='/'?pathname==='/':pathname.startsWith(href);return <Link key={href} href={href} className={`nav-item ${active?'active':''}`} style={{'--accent':colors[key]} as React.CSSProperties}><span className="nav-icon"><Icon size={20}/></span><span>{label}</span></Link>})}</div></nav>;
}
