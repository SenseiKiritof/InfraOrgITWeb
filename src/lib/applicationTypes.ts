import { useQuery } from "@tanstack/react-query";
import { type ApplicationType, listOf } from "./inventory";

export function useApplicationTypes() {
  const query = useQuery({
    queryKey: ["application-types"],
    queryFn: () => listOf<ApplicationType>("/api/application-types"),
  });
  const types = query.data ?? [];
  const options = types.map((type) => ({
    value: type.name,
    label: type.label,
  }));
  const label = (name: string) =>
    types.find((type) => type.name === name)?.label ?? name;
  return { types, options, label, isLoading: query.isLoading };
}

/** Mantiene il valore corrente nel select anche se il tipo non è più in elenco. */
export function optionsWithValue(
  options: { value: string; label: string }[],
  value: string,
) {
  if (!value || options.some((option) => option.value === value))
    return options;
  return [{ value, label: value }, ...options];
}
