import { SmartForecast } from "@/components/smart-forecast";
import { SmartEnergyProvider } from "@/components/smart-energy-provider";
import { SurplusRecommendations } from "@/components/surplus-recommendations";

/**
 * الطاقة، من الأهم إلى التفاصيل: الليلة الجارية (ليلًا فقط)، ثم الأيام ويومها
 * المختار، ثم أفضل وقت لاستخدام الشمس، ثم البطارية يومًا بيوم.
 */
export default function EnergyPage() {
  return (
    <div className="w-full space-y-3 pb-4" dir="rtl">
      <SmartEnergyProvider>
        <SmartForecast afterDay={<SurplusRecommendations />} />
      </SmartEnergyProvider>
    </div>
  );
}
