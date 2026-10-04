'use client';

import {FormEvent, useState} from 'react';
import {LockKeyhole, LogIn, Sun, UserRound} from 'lucide-react';
import {useRouter, useSearchParams} from 'next/navigation';

export default function LoginPage(){
 const router=useRouter();
 const searchParams=useSearchParams();
 const [username,setUsername]=useState('');
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  setError('');
  setLoading(true);
  try{
   const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   const data=await response.json();
   if(!response.ok){setError(data.error ?? 'تعذر تسجيل الدخول.');return;}
   const next=searchParams.get('next');
   router.replace(next?.startsWith('/') ? next : '/');
   router.refresh();
  }catch{
   setError('تعذر الاتصال بالخادم. حاول مرة أخرى.');
  }finally{
   setLoading(false);
  }
 }

 return <main className="login-page">
  <div className="login-card">
   <div className="login-brand-mark"><Sun size={30}/></div>
   <h1>تسجيل الدخول</h1>
   <p>أدخل بيانات الدخول للوصول إلى Solar</p>
   <form onSubmit={submit} className="login-form">
    <label className="login-field"><span>اسم المستخدم</span><div><UserRound size={18}/><input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required /></div></label>
    <label className="login-field"><span>كلمة المرور</span><div><LockKeyhole size={18}/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></div></label>
    {error && <div className="login-error" role="alert">{error}</div>}
    <button className="login-button" disabled={loading}>{loading?'جارٍ التحقق...':<><LogIn size={18}/> دخول</>}</button>
   </form>
  </div>
 </main>
}
