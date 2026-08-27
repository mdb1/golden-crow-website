"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_CATEGORY_OPTIONS,
  normalizeCrmCategory,
} from "@/lib/partnership-crm";

const CRM_ALL_CATEGORIES_VALUE = "__all_categories__";
const CRM_NO_CATEGORY_VALUE = "__no_category__";

export function formatCrmCategory(value: string, language: AppLanguage) {
  const normalized = normalizeCrmCategory(value);
  return normalized ? appText(language, normalized) : value.trim();
}

export function CrmCategorySelect({
  id,
  value,
  onChange,
  language,
  mode,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
  mode: "filter" | "form";
}) {
  const t = (text: string) => appText(language, text);
  const emptyValue =
    mode === "filter" ? CRM_ALL_CATEGORIES_VALUE : CRM_NO_CATEGORY_VALUE;

  return (
    <Select
      value={value || emptyValue}
      onValueChange={(nextValue) =>
        onChange(nextValue === emptyValue ? "" : nextValue)
      }
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={emptyValue}>
          {mode === "filter" ? t("All categories") : t("No category")}
        </SelectItem>
        {CRM_CATEGORY_OPTIONS.map((category) => (
          <SelectItem key={category} value={category}>
            {t(category)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
