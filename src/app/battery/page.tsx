import {EmptyState} from '@/components/EmptyState';

export default function BatteryPage(){
 return <>
  <h1 className="page-title">البطارية</h1><p className="page-subtitle">حالة البطارية والشحن والتفريغ</p>
  <div className="card" style={{marginBottom:12}}>
   <div className="progress-ring"><div className="progress-content"><div className="progress-value">--</div><div className="progress-label">نسبة الشحن SOC</div></div></div>
   <div className="grid-3">
    <div className="metric-card"><div className="metric-head">الجهد</div><div className="metric-value" style={{color:'#26a69a'}}>-- <small>V</small></div></div>
    <div className="metric-card"><div className="metric-head">التيار</div><div className="metric-value" style={{color:'#26a69a'}}>-- <small>A</small></div></div>
    <div className="metric-card"><div className="metric-head">القدرة</div><div className="metric-value" style={{color:'#26a69a'}}>-- <small>kW</small></div></div>
   </div>
  </div>
  <div className="card" style={{marginBottom:12}}>
   <h2 className="section-title">الشحن خلال آخر 24 ساعة</h2>
   <EmptyState text="لا توجد قراءات محفوظة لعرض السجل"/>
  </div>
  <div className="card">
   <h2 className="section-title">مواصفات البطارية</h2>
   <div className="grid-2">
    <div><span className="muted">النوع</span><div>--</div></div>
    <div><span className="muted">السعة</span><div>-- <span className="unit">kWh</span></div></div>
    <div><span className="muted">الجهد الاسمي</span><div>48 <span className="unit">V</span></div></div>
    <div><span className="muted">حد الاحتياطي</span><div>20%</div></div>
   </div>
  </div>
 </>
}