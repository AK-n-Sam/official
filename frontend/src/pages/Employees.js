import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { employeesConfig } from "@/modules/resourceConfigs";

export default function Employees() {
  const { format } = useCurrency();
  return <ResourceManager config={employeesConfig(format)} />;
}
