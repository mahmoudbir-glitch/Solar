type Props={title:string,value:number|string|null,unit?:string,icon?:React.ReactNode,accent?:string};
export function Metric({title,value,unit,icon,accent='#2C3E50'}:Props){
 return <div className="metric-card">
  <div className="metric-head"><span>{icon}</span><span>{title}</span></div>
  <div className="metric-value" style={{color:accent}}>{value===null?'—':value} <small>{unit}</small></div>
 </div>
}
