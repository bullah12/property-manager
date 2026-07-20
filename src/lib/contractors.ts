export const CONTRACTOR_TRADE_VALUES = [
  "plumber",
  "electrician",
  "gas_engineer",
  "heating_engineer",
  "builder",
  "handyman",
  "roofer",
  "decorator",
  "locksmith",
  "cleaner",
  "gardener",
  "pest_control",
  "drainage",
  "appliance_repair",
  "other",
] as const;

export type ContractorTrade = (typeof CONTRACTOR_TRADE_VALUES)[number];

export const CONTRACTOR_TRADE_LABELS: Record<ContractorTrade, string> = {
  plumber: "Plumber",
  electrician: "Electrician",
  gas_engineer: "Gas engineer",
  heating_engineer: "Heating engineer",
  builder: "Builder",
  handyman: "Handyperson",
  roofer: "Roofer",
  decorator: "Painter / decorator",
  locksmith: "Locksmith",
  cleaner: "Cleaner",
  gardener: "Gardener",
  pest_control: "Pest control",
  drainage: "Drainage specialist",
  appliance_repair: "Appliance repair",
  other: "Other",
};

export function contractorTradeLabel(trade: string) {
  return CONTRACTOR_TRADE_LABELS[trade as ContractorTrade] ?? trade;
}
