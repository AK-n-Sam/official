import { useNavigate } from "react-router-dom";
import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { employeesConfig } from "@/modules/resourceConfigs";

export default function Employees() {
  const { format } = useCurrency();
  const navigate = useNavigate();
  return <ResourceManager config={employeesConfig(format)} onRowClick={(row) => navigate(`/employees/${row.id}`)} />;
}
