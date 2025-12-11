/* eslint-disable @typescript-eslint/no-explicit-any */
// app/results/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type ApiResult = {
  SoH_pred?: number;
  SoH_smooth?: number;
  DegradationRate_percent?: number;
  Voltage_pred?: number;
  dSoH?: number;
  confidence?: number;
  status?: string;
  [k: string]: any;
};

export default function ResultsPage() {
  const [input, setInput] = useState<Record<string, any> | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [recsVisible, setRecsVisible] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("battery_input");
    if (!raw) {
      setInput(null);
      setLoading(false);
      return;
    }
    const parsed = JSON.parse(raw);
    setInput(parsed);

    async function callApi() {
      setLoading(true);
      try {
        const res = await fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const json = await res.json();

        // Defensive: parse numeric strings to numbers
        const forced: ApiResult = {
          SoH_pred: json.SoH_pred !== undefined ? Number(json.SoH_pred) : undefined,
          SoH_smooth: json.SoH_smooth !== undefined ? Number(json.SoH_smooth) : undefined,
          DegradationRate_percent:
            json.DegradationRate_percent !== undefined ? Number(json.DegradationRate_percent) : undefined,
          Voltage_pred: json.Voltage_pred !== undefined ? Number(json.Voltage_pred) : undefined,
          dSoH: json.dSoH !== undefined ? Number(json.dSoH) : undefined,
          confidence: json.confidence !== undefined ? Number(json.confidence) : undefined,
          status: json.status ?? undefined,
        };

        setResult(forced);
      } catch (e) {
        console.error("Prediction call failed:", e);
      } finally {
        setLoading(false);
      }
    }

    callApi();
  }, []);

  if (!input && !loading) {
    return <div className="p-8">No input found. Go back to home and submit data.</div>;
  }

  if (loading) {
    return <div className="p-8">Loading predictions...</div>;
  }

  if (!result) {
    return <div className="p-8">Prediction failed. Check console for errors.</div>;
  }

  // use SoH_pred if present else SoH_smooth
  const baseSoH = Number.isFinite(result.SoH_pred) ? result.SoH_pred! : result.SoH_smooth ?? 0;
  const dSoH = Number.isFinite(result.dSoH) ? result.dSoH! : -0.02;

  // Build a future SoH simulation (20 steps)
  const steps = 20;
  const simSoH = Array.from({ length: steps }, (_, i) => Number((baseSoH + i * dSoH).toFixed(4)));
  const labels = Array.from({ length: steps }, (_, i) => `${i + 1}`);

  // Small SOC / Voltage quick arrays (mock trend around current)
  const socNow = Number(input?.soc ?? 0);
  const voltNow = Number(input?.voltage ?? 0);
  const socSeries = [socNow - 3, socNow - 1, socNow - 0.5, socNow].map((v) => Number(v.toFixed(3)));
  const voltSeries = [voltNow - 0.05, voltNow - 0.02, voltNow - 0.01, voltNow].map((v) => Number(v.toFixed(3)));
  const timeLabels = ["t-3", "t-2", "t-1", "t"];

  // Chart config with explicit colors suitable for dark background
  const simData = {
    labels,
    datasets: [
      {
        label: "Simulated SoH (%)",
        data: simSoH,
        borderColor: "rgba(99,102,241,1)", // indigo-ish visible on dark
        backgroundColor: "rgba(99,102,241,0.12)",
        pointBackgroundColor: "rgba(99,102,241,1)",
        tension: 0.2,
        fill: true,
      },
    ],
  };

  const socVoltData = {
    labels: timeLabels,
    datasets: [
      {
        label: "SOC (%)",
        data: socSeries,
        yAxisID: "y",
        borderColor: "rgba(16,185,129,1)", // green
        backgroundColor: "rgba(16,185,129,0.08)",
        tension: 0.25,
      },
      {
        label: "Measured Voltage (V)",
        data: voltSeries,
        yAxisID: "y1",
        borderColor: "rgba(59,130,246,1)", // blue
        backgroundColor: "rgba(59,130,246,0.08)",
        tension: 0.25,
      },
    ],
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false as const,
    plugins: {
      legend: { labels: { color: "#e5e7eb" } }, // change legend text color for dark bg
    },
    scales: {
      x: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(255,255,255,0.03)" } },
      y: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(255,255,255,0.03)" } },
    },
  };

  const socVoltOptions = {
    ...commonOptions,
    scales: {
      x: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(255,255,255,0.03)" } },
      y: { type: "linear" as const, position: "left" as const, ticks: { color: "#9ca3af" }, title: { display: true, text: "SOC (%)", color: "#9ca3af" } },
      y1: { type: "linear" as const, position: "right" as const, ticks: { color: "#9ca3af" }, grid: { drawOnChartArea: false }, title: { display: true, text: "Voltage (V)", color: "#9ca3af" } },
    },
  };

  // --- Recommendation generation logic ---
  function generateRecommendations(res: ApiResult, inp: Record<string, any> | null) {
    const recs: string[] = [];
    const push = (s: string) => { if (!recs.includes(s)) recs.push(s); };

    const soh = Number.isFinite(res.SoH_pred) ? res.SoH_pred! : Number.isFinite(res.SoH_smooth) ? res.SoH_smooth! : undefined;
    const dsoh = Number.isFinite(res.dSoH) ? res.dSoH! : undefined;
    const cycles = inp?.charging_cycles ? Number(inp.charging_cycles) : undefined;
    const chargingMode = (inp?.charging_mode ?? inp?.ChargingMode ?? "Fast").toString();
    const battTemp = inp?.batt_temp ? Number(inp.batt_temp) : inp?.BatteryTemp ? Number(inp.BatteryTemp) : undefined;
    const efficiency = inp?.efficiency ? Number(inp.efficiency) : undefined;
    const current = inp?.current ? Number(inp.current) : undefined;

    // Priority 1: critical low SoH
    if (soh !== undefined && soh < 70) {
      push("Battery SoH is low (<70%). Schedule professional inspection — battery replacement might be required soon.");
      push("Avoid fast charging and high-current charging sessions to limit further degradation.");
      push("Limit SOC window: keep charge between 20% and 80% to reduce stress on the cells.");
    } else {
      // For moderate/high SoH give maintenance recommendations
      if (soh !== undefined && soh < 85) {
        push("SoH in moderate range (70-85%). Reduce frequent fast charges and deep discharges.");
      } else {
        push("SoH looks healthy (>85%). Maintain good charging habits: prefer slow/night charging when possible.");
      }

      // general longevity tips
      push("Avoid charging to 100% frequently; use 80–90% top-limit if daily range allows.");
      push("Avoid deep discharges below 10–20% frequently — keep SOC in mid-range when possible.");
    }

    // Temperature related
    if (battTemp !== undefined) {
      if (battTemp >= 40) {
        push("High battery temperature detected. Stop heavy charging/driving and allow the pack to cool; consider active cooling.");
      } else if (battTemp >= 35) {
        push("Battery temp is warm (>35°C). Avoid fast charging and high discharge currents until it cools below 35°C.");
      } else {
        push("Maintain ambient and battery temperature as low as practical (20–30°C preferred) to slow aging.");
      }
    } else {
      push("Monitor battery temperature; high temps accelerate degradation.");
    }

    // Degradation speed
    if (dsoh !== undefined) {
      if (dsoh <= -0.015) {
        push("Observed high per-step degradation (ΔSoH). Reduce high-current events and fast charging frequency immediately.");
      } else if (dsoh <= -0.008) {
        push("Moderate degradation rate — adopt conservative charging strategy (lower currents, partial charges).");
      } else {
        push("Low short-term degradation — continue preventive measures to keep it low.");
      }
    }

    // Charging mode
    if (chargingMode?.toLowerCase?.() === "fast") {
      push("You use fast charging. Prefer normal/slow charging for daily top-ups and reserve fast charging for occasional use.");
    }

    // High cycles
    if (cycles !== undefined) {
      if (cycles > 1000) {
        push("High cycle count detected. Consider professional evaluation and review pack balancing and cell health.");
      } else if (cycles > 500) {
        push("Moderate cycle count (>500). Monitor SoH and avoid aggressive charging/discharging to extend life.");
      }
    }

    // Efficiency or current warnings
    if (efficiency !== undefined && efficiency < 95) {
      push("Charging efficiency is low (<95%). Check charger and wiring for losses; ensure good electrical connections.");
    }
    if (current !== undefined && Math.abs(current) > 200) {
      push("High current events observed. Limit peak currents where possible (reduce load or avoid rapid acceleration/fast charging spikes).");
    }

    // Practical user tips
    push("When parking for long periods, store the battery at ~50% SOC and avoid full charge or full discharge.");
    push("If possible, enable battery thermal management and balancing features in the BMS to improve longevity.");

    // limit to top 6-8 most relevant: pick first 6 unique
    return recs.slice(0, 6);
  }

  function onGetRecommendations() {
    const recs = generateRecommendations(result, input);
    setRecommendations(recs);
    setRecsVisible(true);
  }

  function onCloseRecs() {
    setRecsVisible(false);
    setRecommendations([]);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto text-gray-100">
      <h1 className="text-2xl font-bold mb-4">Prediction Results</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded bg-zinc-900">
          <h3 className="text-sm text-gray-300">State of Health</h3>
          <p className="text-3xl font-semibold">{(baseSoH ?? 0).toFixed(3)}%</p>
        </div>

        <div className="p-4 border rounded bg-zinc-900">
          <h3 className="text-sm text-gray-300">Degradation Rate</h3>
          <p className="text-3xl font-semibold">{(result.DegradationRate_percent ?? 0).toFixed(3)}%</p>
        </div>

        <div className="p-4 border rounded bg-zinc-900">
          <h3 className="text-sm text-gray-300">Predicted Voltage</h3>
          <p className="text-3xl font-semibold">{(result.Voltage_pred ?? voltNow).toFixed(3)} V</p>
        </div>
      </div>

      <div className="mt-8 h-64">
        <h2 className="text-lg mb-2">Future SoH Simulation (per step)</h2>
        <Line data={simData} options={commonOptions} />
      </div>

      <div className="mt-8 h-64">
        <h2 className="text-lg mb-2">SOC / Voltage quick view</h2>
        <Line data={socVoltData} options={socVoltOptions} />
      </div>

      <div className="mt-6 text-gray-300">
        <p>Confidence: <strong>{(result.confidence ?? "N/A")}</strong></p>
        <p>Status: <strong>{result.status ?? "N/A"}</strong></p>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onGetRecommendations}
          className="px-4 py-2 bg-evIndigo hover:bg-evIndigo/90 rounded-md text-white font-medium"
        >
          Get Care Recommendations
        </button>

        <button
          onClick={() => {
            // quick export: copy recommendations to clipboard (if present)
            if (recommendations.length > 0) {
              const text = recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
              navigator.clipboard?.writeText(text).then(() => {
                // small feedback
                alert("Recommendations copied to clipboard");
              }).catch(() => {
                alert("Unable to copy to clipboard");
              });
            } else {
              alert("No recommendations yet. Click `Get Care Recommendations` first.");
            }
          }}
          className="px-4 py-2 border border-white/10 rounded-md text-white"
        >
          Copy Recommendations
        </button>
      </div>

      {/* Recommendations panel */}
      {recsVisible && (
        <div className="mt-6 card p-4 rounded-lg">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold">Care Recommendations</h3>
            <button onClick={onCloseRecs} className="text-sm text-slate-300">Close</button>
          </div>

          <ol className="mt-3 list-decimal list-inside space-y-2 text-slate-200">
            {recommendations.map((r, idx) => (
              <li key={idx} className="bg-white/2 p-3 rounded">
                {r}
              </li>
            ))}
          </ol>

          <div className="mt-3 text-sm text-slate-400">
            <strong>Note:</strong> These recommendations are generic and based on current telemetry and model outputs. For safety-critical decisions (e.g., suspected cell fault), consult a qualified technician.
          </div>
        </div>
      )}
    </div>
  );
}
