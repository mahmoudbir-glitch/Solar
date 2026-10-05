'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {Battery,Home,Settings,Zap,Wallet,LogOut,Circle,Sun} from 'lucide-react';
const items=[['/settings','الإعدادات',Settings,'settings'],['/money','المال',Wallet,'money'],['/energy','الطاقة',Zap,'energy'],['/battery','البطارية',Battery,'battery'],['/','المنزل',Home,'home']] as const;
const colors:{[key:string]:string}={home:'#29B6F6',battery:'#26A69A',energy:'#FBC02D',money:'#AB47BC',settings:'#64748B'};
export function Header(){
 const router=useRouter();
 async function logout(){await fetch('/api/auth/logout',{method:'POST'});router.replace('/login');router.refresh();}
 return <header className="app-header"><div className="brand"><div className="brand-mark"><Sun size={24} strokeWidth={2.4}/></div><div><div className="brand-name">شمسك</div><div className="brand-tag">الشمس تعمل من أجلك</div></div></div><div className="header-actions"><div className="live-badge"><Circle size={8} fill="currentColor"/><span>القراءة متأخرة</span><small>آخر قراءة --</small></div><button className="icon-button" aria-label="تسجيل الخروج" onClick={logout}><LogOut size={18}/></button></div></header>;
}
export function Nav(){const pathname=usePathname();return <nav className="bottom-nav"><div className="nav-inner">{items.map(([href,label,Icon,key])=>{const active=href==='/'?pathname==='/':pathname.startsWith(href);return <Link key={href} href={href} className={`nav-item ${active?'active':''}`} style={{'--accent':colors[key]} as React.CSSProperties}><span className="nav-icon"><Icon size={20}/></span><span>{label}</span></Link>})}</div></nav>}
