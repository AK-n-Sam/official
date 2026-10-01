import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { SaleDialog } from "@/components/actions/SaleDialog";
import { GetPaidDialog } from "@/components/actions/GetPaidDialog";
import { BuyStockDialog } from "@/components/actions/BuyStockDialog";
import { FollowUpDialog, ReminderDialog } from "@/components/actions/FollowUpAndRemind";

const ActionsContext = createContext(null);

/**
 * The business actions, available from any screen: sell, get paid, buy stock, follow up, remind.
 * Each opens one dialog that handles every connected record (customer, invoice, payment, stock,
 * expense, task), so the user works in business terms instead of hopping between modules.
 */
export const useActions = () => useContext(ActionsContext);

export function ActionsProvider({ children }) {
  const [active, setActive] = useState(null); // { kind, prefill }
  const open = useCallback((kind) => (prefill = {}) => setActive({ kind, prefill }), []);
  const actions = useMemo(() => ({
    sell: open("sell"),
    getPaid: open("getPaid"),
    buyStock: open("buyStock"),
    followUp: open("followUp"),
    remind: open("remind"),
  }), [open]);
  const dialogProps = (kind) => ({
    open: active?.kind === kind,
    onOpenChange: (o) => !o && setActive(null),
    prefill: active?.kind === kind ? active.prefill : undefined,
  });

  return (
    <ActionsContext.Provider value={actions}>
      {children}
      <SaleDialog {...dialogProps("sell")} />
      <GetPaidDialog {...dialogProps("getPaid")} />
      <BuyStockDialog {...dialogProps("buyStock")} />
      <FollowUpDialog {...dialogProps("followUp")} />
      <ReminderDialog {...dialogProps("remind")} />
    </ActionsContext.Provider>
  );
}
