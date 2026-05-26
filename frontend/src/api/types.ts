export type UserType = "person" | "community" | "business";

export type Sector =
  | "hotel"
  | "industrial"
  | "retail"
  | "hospital"
  | "oficina"
  | "educacion"
  | "restaurante"
  | "otro";

export type BatteryType = "lithium" | "lead_acid" | "agm" | "gel" | "other" | "none";
export type GeneratorFuel = "diesel" | "gasoline" | "lpg" | "natural_gas" | "none";

export type ChatRole = "user" | "assistant" | "system";
export type ChatKind =
  | "general"
  | "prediction"
  | "blackout"
  | "investment"
  | "net_metering"
  | "weather_forecast";

export type ExtraData = Record<string, string | number | boolean | string[]>;

export interface CompanyProfile {
  // Identity
  display_name: string;

  // Location
  latitude: number;
  longitude: number;
  address: string;

  // Consumption & generation
  monthly_grid_consumption_kwh: number;
  monthly_self_generation_kwh: number;
  wants_to_sell_energy: boolean;

  // Solar (structured)
  solar_panels_count: number;
  solar_panel_watts: number;

  // Batteries
  battery_count: number;
  battery_kwh_each: number;
  battery_type: BatteryType;

  // Wind
  wind_turbine_count: number;
  wind_turbine_kw_each: number;

  // Generator
  generator_capacity_kw: number;
  generator_fuel: GeneratorFuel;

  // Inverter
  inverter_kw: number;

  // Business-only
  sector?: Sector | null;
  operating_hours: string;
  critical_loads_count: number;
  flexible_loads_count: number;

  extra_data: ExtraData;
  updated_at?: string;

  // Computed (server-side) — present only on responses
  solar_capacity_kwp?: number;
  battery_capacity_kwh?: number;
  wind_capacity_kw?: number;
  has_any_renewable?: boolean;
}

export interface User {
  id: number;
  email: string;
  user_type: UserType;
  created_at: string;
  profile: CompanyProfile | null;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  user_type: UserType;
  profile: CompanyProfile;
}

export interface ChatMessage {
  id: number;
  role: ChatRole;
  kind: ChatKind;
  content: string;
  created_at: string;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  source: "lmstudio" | "fallback";
}

export interface BlackoutStartResponse {
  session_id: number;
  estimated_autonomy_hours: number;
  critical_load_kw: number;
  plan: string;
  started_at: string;
}

export interface DailyEntry {
  day: number;
  value: number;
}

export interface DailyResponse {
  lat: number;
  lon: number;
  year: number;
  month: number;
  daily: DailyEntry[];
  average: number | null;
  source: "nasa" | "fallback";
  cached: boolean;
}

// ─── New Fase 2 types ────────────────────────────────────────────────────

export interface WeatherDay {
  date: string;
  radiation_kwh_m2: number;
  wind_speed_10m_max_ms: number;
  wind_speed_80m_max_ms: number;
  temperature_min_c: number;
  temperature_max_c: number;
  precipitation_mm: number;
  precipitation_probability_pct: number;
  weather_code: number;
  weather_label: string;
}

export interface WeatherForecastResponse {
  lat: number;
  lon: number;
  timezone: string;
  forecast_days: number;
  days: WeatherDay[];
  source: "open-meteo" | "fallback";
  cached: boolean;
}

export interface YearlyCashFlow {
  year: number;
  generation_kwh: number;
  self_consumed_kwh: number;
  excess_kwh: number;
  tariff_cop: number;
  savings_cop: number;
  excess_revenue_cop: number;
  om_cost_cop: number;
  net_cash_flow_cop: number;
  cumulative_cop: number;
}

export interface InvestmentResponse {
  total_investment_cop: number;
  annual_generation_year1_kwh: number;
  monthly_grid_consumption_kwh: number;
  annual_grid_consumption_kwh: number;
  payback_simple_years: number | null;
  payback_dynamic_years: number | null;
  irr_estimated_pct: number | null;
  total_savings_lifetime_cop: number;
  avg_coverage_pct: number;
  excess_year1_kwh: number;
  cash_flow: YearlyCashFlow[];
  verdict: "excellent" | "good" | "marginal" | "review";
  verdict_message: string;
}

export interface MonthlyBalance {
  month_index: number;
  month_label: string;
  days_in_month: number;
  radiation_kwh_m2_day: number;
  generation_kwh: number;
  consumption_kwh: number;
  self_consumed_kwh: number;
  excess_kwh: number;
  deficit_kwh: number;
  savings_cop: number;
  export_credit_cop: number;
  grid_purchase_cop: number;
  net_balance_cop: number;
}

export interface NetMeteringResponse {
  annual_generation_kwh: number;
  annual_consumption_kwh: number;
  annual_self_consumed_kwh: number;
  annual_excess_kwh: number;
  annual_deficit_kwh: number;
  annual_savings_cop: number;
  annual_export_credit_cop: number;
  annual_grid_purchase_cop: number;
  annual_net_balance_cop: number;
  months: MonthlyBalance[];
  tariff_cop_per_kwh: number;
  export_rate_cop_per_kwh: number;
  eligible_for_creg_030: boolean;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postcode?: string | null;
}
