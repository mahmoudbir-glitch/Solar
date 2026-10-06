"use client";

import React, { createContext, useContext } from "react";
import { useSmartEnergy } from "@/hooks/use-smart-energy";

type SmartEnergy = ReturnType<typeof useSmartEnergy>;
const SmartEnergyContext = createContext<SmartEnergy | null>(null);

/**
 * Runs the forecast hook once per page and shares it, so the forecast and the
 * recommendations below it do not each fetch settings, telemetry and weather.
 */
export function SmartEnergyProvider({ children }: { children: React.ReactNode }) {
  const value = useSmartEnergy();
  return <SmartEnergyContext.Provider value={value}>{children}</SmartEnergyContext.Provider>;
}

export function useSharedSmartEnergy(): SmartEnergy {
  const value = useContext(SmartEnergyContext);
  if (!value) throw new Error("useSharedSmartEnergy must be used inside <SmartEnergyProvider>");
  return value;
}
