import { useNavigate } from "react-router-dom";
import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { customersConfig } from "@/modules/resourceConfigs";

export default function Customers() {
  const { format } = useCurrency();
  const navigate = useNavigate();
  return <ResourceManager config={customersConfig(format)} onRowClick={(row) => navigate(`/customers/${row.id}`)} />;
}
