'use client';

import { useEffect, useState } from 'react';
import {
  BatteryCharging,
  Grid2X2,
  Home as HomeIcon,
  LogOut,
  Settings,
  Sun,
  Wallet,
  Zap,
} from 'lucide-react';
import { EnergyFlow } from '@/components/EnergyFlow';
import type { Telemetry } from '@/lib/types';
import { emptyTelemetry } from '@/lib/types';
import { dailyEnergy } from '@/lib/energy';

type History = { timestamp: string; solarPowerW: number | null; loadPowerW: number | null };
type Tab = 'home' | 'house' | 'battery' | 'energy' | 'money' | 'settings';

type IconComponent = typeof Sun;
type PageData = { title: string; subtitle: string; Icon: IconComponent; color: string };

function amp(value: number | null) {
  return value === null ? '--' : Math.abs(value).toFixed(1);
}

function derivedAmp(powerW: number | null, voltageV: number | null) {
  if (powerW === null || voltageV === null || voltageV <= 0) return null;
  return Math.abs(powerW / voltageV);
}

const navItems: { id: Tab; label: string; icon: IconComponent; color: string }[] = [
  { id: 'home', label: 'الرئيسية', icon: Grid2X2, color: '#8B5CF6' },
  { id: 'house', label: 'المنزل', icon: HomeIcon, color: '#0EA5E9' },
  { id: 'battery', label: 'البطارية', icon: BatteryCharging, color: '#10B981' },
  { id: 'energy', label: 'الطاقة', icon: Sun, color: '#F59E0B' },
  { id: 'money', label: 'المال', icon: Wallet, color: '#14B8A6' },
  { id: 'settings', label: 'الإعدادات', icon: Settings, color: '#E11D48' },
];

function Node({
  type,
  title,
  icon: Icon,
  value,
  current,
}: {
  type: 'solar' | 'home' | 'grid' | 'battery';
  title: string;
  icon: IconComponent;
  value: string;
  current: string;
}) {
  return (
    <div className={`solar-node solar-node-${type}`}>
      <div className="solar-node-icon"><Icon size={27} strokeWidth={1.9} /></div>
      <div className="solar-node-title">{title}</div>
      <div className="solar-node-value">{value} <small>kW</small></div>
      <div className="solar-node-current">{current} A</div>
    </div>
  );
}

function Flow({ telemetry, online }: { telemetry: Telemetry; online: boolean }) {
  const solar = telemetry.solarPowerW === null ? '--' : (telemetry.solarPowerW / 1000).toFixed(2);
  const load = telemetry.loadPowerW === null ? '--' : (telemetry.loadPowerW / 1000).toFixed(2);
  const battery = telemetry.batteryPowerW === null ? '--' : (Math.abs(telemetry.batteryPowerW) / 1000).toFixed(2);
  const homeCurrent = telemetry.outputApparentPowerVA !== null && telemetry.outputVoltageV !== null
    ? derivedAmp(telemetry.outputApparentPowerVA, telemetry.outputVoltageV)
    : derivedAmp(telemetry.loadPowerW, telemetry.outputVoltageV);

  return (
    <div className={`solar-flow ${online ? 'is-online' : 'is-offline'}`}>
      <svg className="solar-flow-svg" viewBox="0 0 700 430" preserveAspectRatio="none" aria-hidden="true">
        <path d="M350 100 C350 145 350 155 350 190" className="solar-flow-path solar-flow-solar" />
        <path d="M175 215 C235 215 270 215 305 215" className="solar-flow-path solar-flow-grid" />
        <path d="M395 215 C455 215 475 215 525 215" className="solar-flow-path solar-flow-home" />
        <path d="M350 240 C350 285 350 300 350 335" className="solar-flow-path solar-flow-battery" />
      </svg>

      <Node type="solar" title="الطاقة الشمسية" icon={Sun} value={solar} current={amp(telemetry.pvCurrentA)} />
      <Node type="grid" title="الشبكة" icon={Zap} value="--" current="--" />
      <Node type="home" title="المنزل" icon={HomeIcon} value={load} current={amp(homeCurrent)} />
      <Node type="battery" title="البطارية" icon={BatteryCharging} value={battery} current={amp(telemetry.batteryCurrentA)} />

      <div className="solar-inverter">
        <div className="solar-inverter-core"><Zap size={27} /></div>
        <strong>الإنفرتر</strong>
        <span>{online ? 'متصل' : 'غير متصل'}</span>
      </div>
    </div>
  );
}

function MetricCard({ type, icon: Icon, title, value, unit, secondary }: { type: string; icon: IconComponent; title: string; value: string; unit: string; secondary: string }) {
  return (
    <div className={`solar-metric solar-metric-${type}`}>
      <div className="solar-metric-icon"><Icon size={21} /></div>
      <div className="solar-metric-title">{title}</div>
      <div className="solar-metric-value">{value} <small>{unit}</small></div>
      <div className="solar-metric-secondary">{secondary}</div>
    </div>
  );
}

function Page({ tab, telemetry }: { tab: Tab; telemetry: Telemetry }) {
  const data: Record<Exclude<Tab, 'home'>, PageData> = {
    house: { title: 'استهلاك المنزل', subtitle: 'مراقبة استهلاك الطاقة داخل المنزل', Icon: HomeIcon, color: '#0EA5E9' },
    battery: { title: 'حالة البطارية', subtitle: 'مستوى الشحن وحالة البطارية', Icon: BatteryCharging, color: '#10B981' },
    energy: { title: 'توقعات الطاقة', subtitle: 'توقع إنتاج الطاقة للأيام القادمة', Icon: Sun, color: '#F59E0B' },
    money: { title: 'التحليل المالي', subtitle: 'مصادر الكهرباء والتوفير', Icon: Wallet, color: '#14B8A6' },
    settings: { title: 'الإعدادات', subtitle: 'إعدادات المنظومة والاتصال', Icon: Settings, color: '#E11D48' },
  };

  if (tab === 'home') return null;
  const { title, subtitle, Icon, color } = data[tab];

  return (
    <section className="solar-page-card">
      <div className="solar-page-heading">
        <div className="solar-page-icon" style={{ color, background: `${color}12` }}><Icon size={26} /></div>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
      </div>

      {tab === 'battery' && (
        <div className="solar-battery-wrap">
          <div className="solar-progress" style={{ '--progress': `${telemetry.batterySoc ?? 0}%` } as React.CSSProperties}>
            <div><strong>{telemetry.batterySoc === null ? '--' : telemetry.batterySoc.toFixed(0)}%</strong><span>مستوى البطارية</span></div>
          </div>
        </div>
      )}

      {tab === 'house' && <div className="solar-placeholder-chart"><div className="solar-bars">{[42,58,46,74,62,82,68,77,53,69,84,61].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div><strong>{telemetry.loadPowerW === null ? '--' : (telemetry.loadPowerW / 1000).toFixed(2)} kW</strong></div>}

      {tab === 'energy' && <div className="solar-day-grid">{['اليوم', 'غداً', 'بعد غد', 'اليوم الرابع'].map((day, i) => <div key={day}><Sun size={27}/><b>{day}</b><strong>{telemetry.solarPowerW === null ? '--' : `${(Number(telemetry.solarPowerW) / 1000 + i * 0.2).toFixed(1)} kWh`}</strong></div>)}</div>}

      {tab === 'money' && <div className="solar-summary-grid"><div><span>الطاقة الشمسية</span><strong>--</strong><small>% من المصادر</small></div><div><span>الشبكة</span><strong>--</strong><small>% من المصادر</small></div><div><span>التوفير</span><strong>--</strong><small>ل.س</small></div></div>}

      {tab === 'settings' && <div className="solar-settings-list">{['إعدادات المنظومة','إعدادات الإنفرتر','Wi-Fi Plug Pro','اتصال البوابة المحلية','التنبيهات'].map(item => <button key={item}>{item}<span>‹</span></button>)}</div>}
    </section>
  );
}

export default function Dashboard({ title = 'الرئيسية', subtitle = 'نظرة واضحة على طاقة منظومتك الآن' }: { title?: string; subtitle?: string }) {
  const [telemetry, setTelemetry] = useState<Telemetry>(emptyTelemetry);
  const [history, setHistory] = useState<History[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('home');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [a, b] = await Promise.all([
          fetch('/api/telemetry', { cache: 'no-store' }),
          fetch('/api/history?hours=24', { cache: 'no-store' }),
        ]);
        if (a.ok && active) setTelemetry(await a.json());
        if (b.ok && active) {
          const d = await b.json();
          setHistory(Array.isArray(d.items) ? d.items : []);
        }
      } catch {}
    };
    load();
    const id = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(id); };
  }, []);

  const online = telemetry.source === 'gateway' && Boolean(telemetry.timestamp);
  const energy = dailyEnergy(history);
  const solar = telemetry.solarPowerW === null ? '--' : (telemetry.solarPowerW / 1000).toFixed(2);
  const load = telemetry.loadPowerW === null ? '--' : (telemetry.loadPowerW / 1000).toFixed(2);
  const battery = telemetry.batterySoc === null ? '--' : telemetry.batterySoc.toFixed(0);

  return (
    <main dir="rtl" className="solar-app">
      <div className="solar-shell">
        <header className="solar-header">
          <div className="solar-brand">
            <div className="solar-brand-mark"><Sun size={27} /></div>
            <div><div className="solar-brand-name">Solar</div><div className="solar-brand-tag">الشمس تعمل من أجلك</div><div className={`solar-live ${online ? 'live' : ''}`}><span />{online ? 'مباشر' : 'غير متصل'}{online && telemetry.timestamp ? ` - آخر قراءة ${new Date(telemetry.timestamp).toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
          </div>
          <button className="solar-logout" type="button"><LogOut size={17}/> <span>تسجيل الخروج</span></button>
        </header>

        {activeTab === 'home' ? (
          <>
            <div className="solar-title-row"><div><h1>{title}</h1><p>{subtitle}</p></div><span className={`solar-status ${online ? 'ok' : ''}`}>{online ? 'النظام يعمل' : 'لا توجد قراءة حية'}</span></div>
            <section className="solar-card solar-flow-card"><Flow telemetry={telemetry} online={online}/></section>
            <section className="solar-metrics">
              <MetricCard type="battery" title="البطارية" icon={BatteryCharging} value={battery} unit="%" secondary={`${amp(telemetry.batteryCurrentA)} A`} />
              <MetricCard type="home" title="استهلاك المنزل" icon={HomeIcon} value={load} unit="kW" secondary={`${amp(derivedAmp(telemetry.loadPowerW, telemetry.outputVoltageV))} A`} />
              <MetricCard type="solar" title="الطاقة الشمسية" icon={Sun} value={solar} unit="kW" secondary={`${amp(telemetry.pvCurrentA)} A`} />
            </section>
            <section className="solar-card solar-summary"><h2>ملخص اليوم</h2><div><div><span>إنتاج اليوم</span><strong>{history.length > 1 ? energy.solarKwh.toFixed(2) : '--'} <small>kWh</small></strong></div><div><span>استهلاك اليوم</span><strong>{history.length > 1 ? energy.loadKwh.toFixed(2) : '--'} <small>kWh</small></strong></div><div><span>التوفير</span><strong>-- <small>ل.س</small></strong></div></div></section>
          </>
        ) : <Page tab={activeTab} telemetry={telemetry} />}
      </div>

      <nav className="solar-nav"><div>{navItems.map(item => { const Icon = item.icon; const active = activeTab === item.id; return <button key={item.id} type="button" className={active ? 'active' : ''} style={{ '--accent': item.color } as React.CSSProperties} onClick={() => setActiveTab(item.id)}><Icon size={21}/><span>{item.label}</span></button>; })}</div></nav>
    </main>
  );
}
