'use client';

import {Battery, Grid3X3, Home, Zap, Gauge} from 'lucide-react';
import type {CSSProperties} from 'react';
import type {Telemetry} from '@/lib/types';

type Props={telemetry:Telemetry};

const nodes=[
 {key:'solar',title:'الطاقة الشمسية',icon:Zap,color:'#F59E0B',position:'top'},
 {key:'home',title:'المنزل',icon:Home,color:'#0EA5E9',position:'right'},
 {key:'battery',title:'البطارية',icon:Battery,color:'#10B981',position:'bottom'},
 {key:'grid',title:'الشبكة',icon:Grid3X3,color:'#8B5CF6',position:'left'},
] as const;

function kw(w:number|null){return w===null?'--':(w/1000).toFixed(2)}
function amp(value:number|null){return value===null?'--':Math.abs(value).toFixed(1)}
function derivedAmp(powerW:number|null,voltageV:number|null){
 if(powerW===null||voltageV===null||voltageV<=0)return null;
 return Math.abs(powerW/voltageV);
}
function pulseDuration(w:number|null){
 if(w===null||w<=0)return '2.8s';
 const power=Math.min(Math.abs(w),7200);
 return `${(3.4-(power/7200)*1.7).toFixed(2)}s`;
}

export function EnergyFlow({telemetry}:Props){
 const dataValid=telemetry.source==='gateway' && Boolean(telemetry.timestamp);
 const solarDuration=pulseDuration(telemetry.solarPowerW);
 const solarCurrent=telemetry.pvCurrentA;
 const homeCurrent=telemetry.outputApparentPowerVA!==null&&telemetry.outputVoltageV!==null&&telemetry.outputVoltageV>0
  ? derivedAmp(telemetry.outputApparentPowerVA,telemetry.outputVoltageV)
  : derivedAmp(telemetry.loadPowerW,telemetry.outputVoltageV);
 const batteryCurrent=telemetry.batteryCurrentA;
 const gridCurrent=derivedAmp(telemetry.gridPowerW,telemetry.gridVoltageV);
 return <div className={`energy-flow ${dataValid?'is-online':'is-offline'}`} aria-label="مخطط تدفق الطاقة">
  <svg className="flow-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
   <line className="flow-path solar-path" x1="50" y1="18" x2="50" y2="40"/>
   <line className="flow-path home-path" x1="60" y1="50" x2="82" y2="50"/>
   <line className="flow-path battery-path" x1="50" y1="60" x2="50" y2="82"/>
   <line className="flow-path grid-path" x1="18" y1="50" x2="40" y2="50"/>
  </svg>
  {nodes.map(({key,title,icon:Icon,color,position})=>{
   const value=key==='solar'?kw(telemetry.solarPowerW):key==='home'?kw(telemetry.loadPowerW):key==='battery'?kw(telemetry.batteryPowerW):kw(telemetry.gridPowerW);
   const current=key==='solar'?solarCurrent:key==='home'?homeCurrent:key==='battery'?batteryCurrent:gridCurrent;
   const duration=key==='solar'?solarDuration:key==='home'?pulseDuration(telemetry.loadPowerW):key==='battery'?pulseDuration(telemetry.batteryPowerW):pulseDuration(telemetry.gridPowerW);
   return <div key={key} className={`flow-node flow-node-${position}`} style={{'--node-color':color,'--pulse-duration':duration} as CSSProperties}>
    <div className="flow-node-icon"><Icon size={22}/></div>
    <div className="flow-node-title">{title}</div>
    <div className="flow-node-value"><span className="power-value">{value} <small>kW</small></span><span className="flow-node-current"><span className="current-number">{amp(current)}</span> A</span></div>
   </div>
  })}
  <div className="flow-center">
   <div className="flow-ring"/>
   <div className="flow-center-inner"><Gauge size={28}/><strong>الإنفرتر</strong><span>{dataValid?telemetry.inverterState||'متصل':'--'}</span></div>
  </div>
 </div>
}
