import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { suppliersConfig } from "@/modules/resourceConfigs";

export default function Suppliers() {
  const { format } = useCurrency();
  return <ResourceManager config={suppliersConfig(format)} />;
}
