import { useNavigate } from "react-router-dom";
import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { usePermissions } from "@/context/AuthContext";
import { employeesConfig } from "@/modules/resourceConfigs";

export default function Employees() {
  const { format, currency } = useCurrency();
  const { isManager } = usePermissions();
  const navigate = useNavigate();
  // Employee records (and pay) are managed by owners and admins; members can look people up.
  return (
    <ResourceManager
      config={employeesConfig(format, { currency, isManager })}
      perms={{ create: isManager, edit: isManager, delete: isManager }}
      onRowClick={(row) => navigate(`/employees/${row.id}`)}
    />
  );
}
