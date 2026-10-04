import {Home, Zap, Battery} from 'lucide-react';
import {EmptyState} from '@/components/EmptyState';

export default function HomePage(){
 return <>
  <h1 className="page-title">المنزل</h1><p className="page-subtitle">استهلاك المنزل ومصادر الطاقة الحالية</p>
  <div className="card" style={{textAlign:'center',marginBottom:12}}>
   <div className="metric-head" style={{justifyContent:'center'}}><Home size={16}/> إجمالي السحب الحالي</div>
   <div style={{fontSize:48,fontWeight:800,direction:'ltr',marginTop:4}}>-- <span className="unit">kW</span></div>
   <div className="muted" style={{fontSize:11}}>التيار -- A</div>
  </div>
  <div className="card" style={{marginBottom:12}}>
   <h2 className="section-title">من أين يأتي استهلاكك الآن؟</h2>
   <div className="segment empty-segment"/>
   <div className="legend"><span>الشمس -- %</span><span>البطارية -- %</span><span>الشبكة -- %</span></div>
  </div>
  <div className="card" style={{marginBottom:12}}>
   <h2 className="section-title">آخر 24 ساعة</h2>
   <EmptyState/>
   <div className="legend"><span>الإنتاج الشمسي --</span><span>استهلاك المنزل --</span></div>
  </div>
  <div className="grid-2">
   <div className="metric-card"><div className="metric-head"><Zap size={15}/> أعلى حمل اليوم</div><div className="metric-value" style={{color:'#29b6f6'}}>-- <small>kW</small></div></div>
   <div className="metric-card"><div className="metric-head"><Battery size={15}/> استهلاك اليوم</div><div className="metric-value" style={{color:'#26a69a'}}>-- <small>kWh</small></div></div>
  </div>
 </>
}