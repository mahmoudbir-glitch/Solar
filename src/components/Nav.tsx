'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {Battery, Home, Settings, Sun, Wallet, Zap, LogOut, Circle} from 'lucide-react';

const items=[
 ['/','الرئيسية',Sun,'solar'],
 ['/home','المنزل',Home,'home'],
 ['/battery','البطارية',Battery,'battery'],
 ['/energy','الطاقة',Zap,'energy'],
 ['/money','المال',Wallet,'money'],
 ['/settings','الإعدادات',Settings,'settings'],
] as const;

const colors:{[key:string]:string}={solar:'#F59E0B',home:'#29B6F6',battery:'#26A69A',energy:'#FBC02D',money:'#AB47BC',settings:'#64748B'};

export function Header(){
 const router=useRouter();
 async function logout(){ await fetch('/api/auth/logout',{method:'POST'}); router.replace('/login'); router.refresh(); }
 return <header className="app-header">
  <div className="brand">
   <div className="brand-mark"><Sun size={24} strokeWidth={2.4}/></div>
   <div><div className="brand-name">Solar</div><div className="brand-tag">مراقبة منظومة الطاقة الشمسية</div></div>
  </div>
  <div className="header-actions">
   <div className="live-badge"><Circle size={8} fill="currentColor"/><span>غير متصل</span><small>آخر قراءة --</small></div>
   <button className="icon-button" aria-label="تسجيل الخروج" onClick={logout}><LogOut size={18}/></button>
  </div>
 </header>
}

export function Nav(){
 const pathname=usePathname();
 return <nav className="bottom-nav"><div className="nav-inner">{items.map(([href,label,Icon,key])=>{
  const active=pathname===href;
  return <Link key={href} href={href} className={`nav-item ${active?'active':''}`} style={{'--accent':colors[key]} as React.CSSProperties}>
   <span className="nav-icon"><Icon size={20}/></span><span>{label}</span>
  </Link>
 })}</div></nav>
}
