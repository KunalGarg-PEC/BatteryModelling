// app/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  soc: string;
  voltage: string;
  current: string;
  batt_temp: string;
  amb_temp: string;
  charge_duration: string;
  charging_cycles: string;
  charging_mode: string;
  efficiency: string;
  battery_type: string;
  ev_model: string;
};

export default function HomePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    soc: "43.7086",
    voltage: "3.62959305",
    current: "33.55351154",
    batt_temp: "33.45405988",
    amb_temp: "26.43991757",
    charge_duration: "59.36355203",
    charging_cycles: "112",
    charging_mode: "Fast",
    efficiency: "98.23898076",
    battery_type: "Li-ion",
    ev_model: "Model B"
  });

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    // save to sessionStorage for results page
    sessionStorage.setItem("battery_input", JSON.stringify(form));
    router.push("/result");
  }

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">EV Battery - Predict</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label>
          SOC (%)
          <input name="soc" value={form.soc} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Voltage (V)
          <input name="voltage" value={form.voltage} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Current (A)
          <input name="current" value={form.current} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Battery Temp (°C)
          <input name="batt_temp" value={form.batt_temp} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Ambient Temp (°C)
          <input name="amb_temp" value={form.amb_temp} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Charging Duration (min)
          <input name="charge_duration" value={form.charge_duration} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Charging Cycles
          <input name="charging_cycles" value={form.charging_cycles} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Charging Mode
          <select name="charging_mode" value={form.charging_mode} onChange={onChange} className="w-full p-2 border rounded">
            <option>Fast</option>
            <option>Normal</option>
            <option>Trickle</option>
          </select>
        </label>

        <label>
          Efficiency (%)
          <input name="efficiency" value={form.efficiency} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          Battery Type
          <input name="battery_type" value={form.battery_type} onChange={onChange} className="w-full p-2 border rounded" />
        </label>

        <label>
          EV Model
          <input name="ev_model" value={form.ev_model} onChange={onChange} className="w-full p-2 border rounded" />
        </label>
      </form>

      <div className="mt-6">
        <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white rounded">
          Predict
        </button>
      </div>
    </div>
  );
}
