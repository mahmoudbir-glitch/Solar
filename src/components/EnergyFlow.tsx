'use client';

import {Battery, Grid3X3, Home, Zap, Gauge} from 'lucide-react';
import type {CSSProperties} from 'react';
import type {Telemetry} from '@/lib/types';

type Props={telemetry:Telemetry};

const nodes=[
 {key:'solar',title:'الطاقة الشمسية',icon:Zap,color:'#f59e0b',position:'top'},
 {key:'home',title:'المنزل',icon:Home,color:'#29b6f6',position:'right'},
 {key:'battery',title:'البطارية',icon:Battery,color:'#26a69a',position:'bottom'},
 {key:'grid',title:'الشبكة',icon:Grid3X3,color:'#ab47bc',position:'left'},
] as const;

function kw(w:number|null){return w===null?'--':(w/1000).toFixed(2)}

export function EnergyFlow({telemetry}:Props){
 const online=telemetry.source==='gateway' && Boolean(telemetry.timestamp);
 return <div className={`energy-flow ${online?'is-online':'is-offline'}`} aria-label="مخطط تدفق الطاقة">
  <div className="flow-lines" aria-hidden="true">
   <span className="flow-line flow-line-v"/><span className="flow-line flow-line-h"/>
  </div>
  {nodes.map(({key,title,icon:Icon,color,position})=><div key={key} className={`flow-node flow-node-${position}`} style={{'--node-color':color} as CSSProperties}>
   <div className="flow-node-icon"><Icon size={22}/></div>
   <div className="flow-node-title">{title}</div>
   <div className="flow-node-value">{key==='solar'?kw(telemetry.solarPowerW):key==='home'?kw(telemetry.loadPowerW):key==='battery'?kw(telemetry.batteryPowerW):'--'} <small>kW</small></div>
  </div>)}
  <div className="flow-center">
   <div className="flow-ring"/>
   <div className="flow-center-inner"><Gauge size={28}/><strong>الإنفرتر</strong><span>{online?telemetry.inverterState||'متصل':'--'}</span></div>
  </div>
 </div>
}