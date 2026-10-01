import { useState } from "react";
import { Repeat } from "lucide-react";
import { ResourceManager } from "@/components/common/ResourceManager";
import { useCurrency } from "@/context/CurrencyContext";
import { usePermissions } from "@/context/AuthContext";
import { expensesConfig } from "@/modules/resourceConfigs";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RepeatDialog } from "@/components/automation/RepeatDialog";

export default function Expenses() {
  const { format, currency } = useCurrency();
  const { isManager } = usePermissions();
  const [repeat, setRepeat] = useState(null);
  // Rent, subscriptions and other regular bills: added for you each period, ready to pay.
  const rowActions = isManager
    ? (row) => (row.recurring_id ? null : (
      <DropdownMenuItem onClick={() => setRepeat({ type: "expense", id: row.id, label: `${row.vendor || row.category} · ${format(row.amount)}`, date: row.date })} data-testid={`repeat-${row.id}`}>
        <Repeat className="mr-2 h-4 w-4" /> Repeat…
      </DropdownMenuItem>
    ))
    : undefined;
  return (
    <>
      <ResourceManager section="spending" config={expensesConfig(format, { currency })} rowActions={rowActions} />
      <RepeatDialog open={!!repeat} onOpenChange={(o) => !o && setRepeat(null)} source={repeat} />
    </>
  );
}
