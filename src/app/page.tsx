import {Header} from '@/components/Nav';
import {Metric} from '@/components/Metric';
import {getGatewayTelemetry} from '@/lib/gateway';

export const dynamic='force-dynamic';

function kw(value:number|null){return value===null?'—':(value/1000).toFixed(1)}

export default async function Home(){
 const t=await getGatewayTelemetry();
 const connected=t.source==='gateway';
 return <>
  <Header/>
  <div className="mb-5 card p-5">
   <div className="flex items-center justify-between gap-4">
    <div>
     <h2 className="text-lg font-bold">Axpert MAX 7200-48-230</h2>
     <p className="muted text-sm">Voltronic Power · 7.2 kW · 48 V · SN <bdi dir="ltr">92932009104508</bdi></p>
    </div>
    <span className={`rounded-full px-3 py-1 text-xs ${connected?'bg-emerald-500/15 text-emerald-300':'bg-red-500/15 text-red-300'}`}>{connected?'متصل وقراءة حقيقية':'غير متصل'}</span>
   </div>
  </div>
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
   <Metric title="إنتاج الشمس" value={t.solarPowerW===null?null:Number(kw(t.solarPowerW))} unit="kW"/>
   <Metric title="استهلاك المنزل" value={t.loadPowerW===null?null:Number(kw(t.loadPowerW))} unit="kW"/>
   <Metric title="البطارية" value={t.batterySoc} unit="%"/>
   <Metric title="الشبكة" value={t.gridPowerW===null?null:Number(kw(t.gridPowerW))} unit="kW"/>
  </div>
  <div className="mt-4 grid gap-4 md:grid-cols-2">
   <div className="card p-5"><h3 className="font-bold">حالة الإنفرتر</h3><p className="mt-3 text-emerald-300">{t.inverterState||'لا توجد قراءة حقيقية'}</p></div>
   <div className="card p-5"><h3 className="font-bold">التنبيهات</h3><p className="mt-3 muted">{t.warnings.length?t.warnings.join('، '):'لا توجد قراءة تنبيهات حالياً'}</p></div>
  </div>
  <div className="mt-4 card p-5">
   <h3 className="font-bold">مواصفات الجهاز</h3>
   <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
    <div><span className="muted">القدرة</span><div>7.2 kW</div></div>
    <div><span className="muted">البطارية</span><div>48 VDC</div></div>
    <div><span className="muted">PV الأقصى</span><div>8 kW</div></div>
    <div><span className="muted">PV Voc الأقصى</span><div>500 VDC</div></div>
   </div>
  </div>
 </>
}