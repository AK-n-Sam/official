import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { productsConfig } from "@/modules/resourceConfigs";

export default function Products() {
  const { format } = useCurrency();
  return <ResourceManager config={productsConfig(format)} />;
}
