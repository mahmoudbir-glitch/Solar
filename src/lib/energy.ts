export type EnergySample={timestamp:string;solarPowerW:number|null;loadPowerW:number|null};

function integrate(samples:EnergySample[],key:'solarPowerW'|'loadPowerW'){
 let wh=0;
 for(let i=1;i<samples.length;i++){
  const previous=samples[i-1];
  const current=samples[i];
  const a=previous[key];
  const b=current[key];
  const t1=Date.parse(previous.timestamp);
  const t2=Date.parse(current.timestamp);
  if(a===null||b===null||!Number.isFinite(t1)||!Number.isFinite(t2)||t2<=t1) continue;
  const seconds=Math.min((t2-t1)/1000,300);
  wh+=((a+b)/2)*(seconds/3600);
 }
 return wh/1000;
}

export function dailyEnergy(samples:EnergySample[]){
 return {solarKwh:integrate(samples,'solarPowerW'),loadKwh:integrate(samples,'loadPowerW')};
}

export function averagePower(samples:EnergySample[],key:'solarPowerW'|'loadPowerW'){
 const values=samples.map(x=>x[key]).filter((x):x is number=>typeof x==='number'&&Number.isFinite(x));
 return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}
