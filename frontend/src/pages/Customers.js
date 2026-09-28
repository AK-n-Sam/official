import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { customersConfig } from "@/modules/resourceConfigs";

export default function Customers() {
  const { format } = useCurrency();
  return <ResourceManager config={customersConfig(format)} />;
}
