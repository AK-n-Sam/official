import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { usePermissions } from "@/context/AuthContext";
import { productsConfig } from "@/modules/resourceConfigs";

export default function Products() {
  const { format, currency } = useCurrency();
  const { isManager } = usePermissions();
  // Everyone can add and update products; only owners and admins remove them.
  return <ResourceManager config={productsConfig(format, { currency })} perms={{ create: true, edit: true, delete: isManager }} />;
}
