/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/telemetry/route.ts
import { NextResponse } from 'next/server';

type RawPayload = Record<string, any>;
type Payload = {
  soc?: number;
  voltage?: number;
  current?: number;
  batt_temp?: number;
  amb_temp?: number;
  charge_duration?: number;
  charging_cycles?: number;
  charging_mode?: string;
  efficiency?: number;
  battery_type?: string;
  ev_model?: string;
  timestamp?: number;
};

function normalize(raw: RawPayload): Payload {
  if (!raw) return {};
  const get = (a: string[], def?: any) => {
    for (const k of a) {
      if (k in raw && raw[k] !== null && raw[k] !== undefined) return raw[k];
    }
    return def;
  };

  return {
    soc: Number(get(['soc','SOC'], NaN)),
    voltage: Number(get(['voltage','Voltage'], NaN)),
    current: Number(get(['current','Current'], NaN)),
    batt_temp: Number(get(['batt_temp','BatteryTemp'], NaN)),
    amb_temp: Number(get(['amb_temp','AmbientTemp'], NaN)),
    charge_duration: Number(get(['charge_duration','ChargeDuration'], NaN)),
    charging_cycles: Number(get(['charging_cycles','ChargingCycles','cycles'], NaN)),
    charging_mode: String(get(['charging_mode','ChargingMode','mode'], 'Fast')),
    efficiency: Number(get(['efficiency','Efficiency'], 100)),
    battery_type: String(get(['battery_type','BatteryType'], 'Li-ion')),
    ev_model: String(get(['ev_model','EVModel'], 'Model A')),
    timestamp: Number(get(['timestamp'], Date.now()))
  };
}

// Simple, deterministic fallback predictor (replace with model inference later)
function fallbackPredict(p: Payload) {
  const soc = Number.isFinite(p.soc) ? p.soc! : 50;
  const current = Number.isFinite(p.current) ? p.current! : 0;
  const batt_temp = Number.isFinite(p.batt_temp) ? p.batt_temp! : 25;
  const cycles = Number.isFinite(p.charging_cycles) ? p.charging_cycles! : 100;
  const efficiency = Number.isFinite(p.efficiency) ? p.efficiency! : 100;

  let soh = 100 - (cycles * 0.01) - Math.max(0, (batt_temp - 25) * 0.02) - Math.max(0, (100 - efficiency) * 0.01);
  soh = Math.max(40, Math.min(100, soh));

  const voltage_ocv = 3.0 + 1.2 * (Math.max(0, Math.min(100, soc)) / 100.0);
  const internal_drop = 0.005 * Math.abs(current);
  const voltage_pred = Number((voltage_ocv - internal_drop).toFixed(3));

  const degradation_percent = Number((100 - soh).toFixed(3));
  const dSoH = -Math.max(0.005, (cycles > 500 ? 0.02 : 0.01));

  return {
    SoH_pred: Number(soh.toFixed(4)),
    SoH_smooth: Number(soh.toFixed(4)),
    DegradationRate_percent: degradation_percent,
    Voltage_pred: voltage_pred,
    dSoH: Number(dSoH.toFixed(4))
  };
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const payload = normalize(raw);

    // require at least SOC to be present
    if (!Number.isFinite(payload.soc)) {
      return NextResponse.json({ error: 'Missing required field: soc (SOC)' }, { status: 400 });
    }

    // TODO: replace fallbackPredict with your real model inference if available
    const predicted = fallbackPredict(payload);

    // compute confidence from residual if measured voltage present
    const measuredV = Number.isFinite(payload.voltage) ? payload.voltage! : undefined;
    let confidence = 0.5;
    if (measuredV !== undefined) {
      const residual = Math.abs(measuredV - predicted.Voltage_pred);
      confidence = Math.max(0, 1 - residual / 0.6);
    }
    // predicted.confidence = Number(confidence.toFixed(3));

    // status
    let status = 'OK';
    // if (predicted.S0H_pred !== undefined) {} // no-op to avoid lint issues
    // if (predicted.S0H_pred === undefined) { /* noop */ }
    // if (predicted.S0H_pred === undefined) { /* noop */ }
    // // use SoH_pred for status:
    // if (predicted.S0H_pred === undefined) {
    //   // fallback - use SoH_pred available:
    // }
    // safer: use SoH_pred
    if (predicted.SoH_pred < 70) status = 'REPLACE_SOON';
    else if (predicted.SoH_pred < 85) status = 'MODERATE';

    (predicted as any).status = status;

    return NextResponse.json(predicted);
  } catch (err: any) {
    console.error('telemetry error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
