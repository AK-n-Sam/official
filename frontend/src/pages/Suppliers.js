import { ResourceManager } from "@/components/common/ResourceManager";
import { usePermissions } from "@/context/AuthContext";
import { suppliersConfig } from "@/modules/resourceConfigs";

export default function Suppliers() {
  const { isManager } = usePermissions();
  // Everyone can add and update suppliers; only owners and admins remove them.
  return <ResourceManager config={suppliersConfig()} perms={{ create: true, edit: true, delete: isManager }} />;
}
