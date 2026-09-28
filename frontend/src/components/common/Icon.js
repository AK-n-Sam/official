import * as Icons from "lucide-react";

export function Icon({ name, className }) {
  const Cmp = Icons[name] || Icons.Circle;
  return <Cmp className={className} />;
}
