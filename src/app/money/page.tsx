'use client';
import {useEffect,useState} from 'react';
import {Wallet} from 'lucide-react';
import {EmptyState} from '@/components/EmptyState';
import {dailyEnergy} from '@/lib/energy';

type History={timestamp:string;solarPowerW:number|null;loadPowerW:number|null;gridPowerW:number|null};
type SavedSettings={gridTariff?:string;systemCost?:string};

export default function Money(){
 const [history,setHistory]=useState<History[]>([]);const [settings,setSettings]=useState<SavedSettings>({});
 useEffect(()=>{let active=true;const load=async()=>{try{const response=await fetch('/api/history?hours=720',{cache:'no-store'});if(response.ok&&active){const d=await response.json();setHistory(Array.isArray(d.items)?d.items:[])}}catch{};try{const raw=localStorage.getItem('solar_settings');if(raw&&active)setSettings(JSON.parse(raw))}catch{}};load();const id=window.setInterval(load,30000);return()=>{active=false;window.clearInterval(id)}},[]);
 const energy=dailyEnergy(history);const tariff=Number(settings.gridTariff);const systemCost=Number(settings.systemCost);const hasTariff=Number.isFinite(tariff)&&tariff>0&&history.length>1;const gridCost=hasTariff?energy.gridKwh*tariff:null;const saving=hasTariff?energy.solarKwh*tariff:null;
 return <>
  <h1 className="page-title">المال</h1><p className="page-subtitle">تحليل الوفر وتكلفة الطاقة</p>
  <div className="card" style={{marginBottom:12,textAlign:'center'}}><div className="metric-head" style={{justifyContent:'center'}}><Wallet size={16}/> الوفر المحسوب من القراءات الحقيقية</div><div style={{fontSize:42,fontWeight:800,color:saving===null?'#aeb8bb':'#ab47bc',direction:'ltr',marginTop:5}}>{saving===null?'--':saving.toFixed(0)} <span className="unit">ل.س</span></div><p className="muted" style={{fontSize:11}}>{hasTariff?'محسوب من إنتاج الشمس × تعرفة الشبكة المحفوظة.':'أضف تعرفة الشبكة في الإعدادات لبدء الحساب، ولن يتم تخمين أي رقم.'}</p></div>
  <div className="card" style={{marginBottom:12}}><h2 className="section-title">مصادر الكهرباء — القراءات المحفوظة</h2>{history.length<2?<EmptyState/>:<div className="legend"><span>الشمس {energy.solarKwh.toFixed(2)} kWh</span><span>الشبكة {energy.gridKwh.toFixed(2)} kWh</span></div>}</div>
  <div className="grid-2"><div className="metric-card"><div className="metric-head">تكلفة النظام الشمسي</div><div className="metric-value" style={{color:systemCost>0?'#26a69a':'#aeb8bb'}}>{systemCost>0?systemCost.toLocaleString('ar-SY'):'--'} <small>ل.س</small></div></div><div className="metric-card"><div className="metric-head">تكلفة الشبكة المحسوبة</div><div className="metric-value" style={{color:gridCost===null?'#aeb8bb':'#ab47bc'}}>{gridCost===null?'--':gridCost.toFixed(0)} <small>ل.س</small></div></div></div>
 </>
}
