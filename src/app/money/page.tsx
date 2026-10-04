import {Wallet} from 'lucide-react';
import {EmptyState} from '@/components/EmptyState';

export default function Money(){
 return <>
  <h1 className="page-title">المال</h1><p className="page-subtitle">تحليل الوفر وتكلفة الطاقة</p>
  <div className="card" style={{marginBottom:12,textAlign:'center'}}>
   <div className="metric-head" style={{justifyContent:'center'}}><Wallet size={16}/> إجمالي الوفر المالي</div>
   <div style={{fontSize:42,fontWeight:800,color:'#ab47bc',direction:'ltr',marginTop:5}}>-- <span className="unit">ل.س</span></div>
   <p className="muted" style={{fontSize:11}}>سيتم الحساب من بيانات الاستهلاك والتعرفة الفعلية.</p>
  </div>
  <div className="card" style={{marginBottom:12}}>
   <h2 className="section-title">مصادر الكهرباء — آخر 5 أيام</h2>
   <EmptyState/>
   <div className="legend"><span>الشمس --</span><span>البطارية --</span><span>الشبكة --</span></div>
  </div>
  <div className="grid-2">
   <div className="metric-card"><div className="metric-head">تكلفة النظام الشمسي</div><div className="metric-value" style={{color:'#26a69a'}}>-- <small>ل.س</small></div></div>
   <div className="metric-card"><div className="metric-head">تكلفة الشبكة الافتراضية</div><div className="metric-value" style={{color:'#ab47bc'}}>-- <small>ل.س</small></div></div>
  </div>
 </>
}