import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { expensesConfig } from "@/modules/resourceConfigs";

export default function Expenses() {
  const { format, currency } = useCurrency();
  return <ResourceManager config={expensesConfig(format, { currency })} />;
}
