import {Zap, Home, Battery, Grid3X3, CircleAlert, Gauge} from 'lucide-react';

const Node=({className,icon,color,title}:{className:string,icon:React.ReactNode,color:string,title:string})=><div className={"dash-node "+className}><div className="node-icon" style={{background:color+"18",color:color}}>{icon}</div><div className="node-title">{title}</div><div className="node-value">-- <span className="node-unit">kW</span></div><div className="node-unit">-- A</div></div>;

export default function Dashboard(){
 return <>
  <h1 className="page-title">الرئيسية</h1>
  <p className="page-subtitle">نظرة مباشرة على منظومة الطاقة</p>
  <div className="offline-banner"><CircleAlert size={16}/> <span>النظام غير متصل — لا توجد قراءات حقيقية حالياً</span></div>
  <div className="card">
   <div className="diagram">
    <div className="diagram-line line-v"/><div className="diagram-line line-h"/>
    <Node className="top-node" icon={<Zap size={20}/>} color="#f59e0b" title="الطاقة الشمسية"/>
    <Node className="right-node" icon={<Home size={20}/>} color="#29b6f6" title="المنزل"/>
    <Node className="bottom-node" icon={<Battery size={20}/>} color="#26a69a" title="البطارية"/>
    <Node className="left-node" icon={<Grid3X3 size={20}/>} color="#ab47bc" title="الشبكة"/>
    <div className="center-node"><div style={{textAlign:'center'}}><Gauge size={30}/><strong>الإنفرتر</strong><div style={{fontSize:9,color:'#90a4ae'}}>-- kW</div></div></div>
   </div>
  </div>
  <div className="grid-2" style={{marginTop:12}}>
   <div className="metric-card"><div className="metric-head">إنتاج اليوم</div><div className="metric-value" style={{color:'#f59e0b'}}>-- <small>kWh</small></div></div>
   <div className="metric-card"><div className="metric-head">استهلاك اليوم</div><div className="metric-value" style={{color:'#29b6f6'}}>-- <small>kWh</small></div></div>
  </div>
 </>
}